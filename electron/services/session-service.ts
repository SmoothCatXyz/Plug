import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { chatMessageSchema, plugSessionSchema, sessionSnapshotSchema } from "../../shared/ipc-schema";
import type { ChatMessage, ChatRole, PlugSession, ProjectSummary, SessionSnapshot } from "../../shared/types";
import { getProjectById } from "./project-service";

const sessionIndexSchema = z.object({
  version: z.literal(1),
  activeSessionId: z.string()
});

type SessionIndex = z.infer<typeof sessionIndexSchema>;

export async function getSessionSnapshot(projectId: string): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const { sessions, activeSessionId } = await readSessionsWithActive(project);
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];

  if (!activeSession) {
    return createSession(projectId);
  }

  await writeSessionIndex(project, { version: 1, activeSessionId: activeSession.id });
  return toSnapshot(project, sessions, activeSession);
}

export async function createSession(projectId: string): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const sessions = await readSessions(project);
  const now = new Date().toISOString();
  const session: PlugSession = {
    version: 1,
    id: randomUUID(),
    title: `新对话 ${sessions.length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    toolEvents: []
  };

  await writeSession(project, session);
  await writeSessionIndex(project, { version: 1, activeSessionId: session.id });

  return toSnapshot(project, [...sessions, session], session);
}

export async function openSession(projectId: string, sessionId: string): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const sessions = await readSessions(project);
  const session = sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    throw new Error(`Session was not found: ${sessionId}`);
  }

  await writeSessionIndex(project, { version: 1, activeSessionId: session.id });
  return toSnapshot(project, sessions, session);
}

export async function renameSession(projectId: string, sessionId: string, title: string): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const sessions = await readSessions(project);
  const session = sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    throw new Error(`Session was not found: ${sessionId}`);
  }

  const renamedSession: PlugSession = {
    ...session,
    title: title.trim(),
    updatedAt: new Date().toISOString()
  };

  await writeSession(project, renamedSession);
  await writeSessionIndex(project, { version: 1, activeSessionId: renamedSession.id });

  return toSnapshot(
    project,
    sessions.map((entry) => (entry.id === renamedSession.id ? renamedSession : entry)),
    renamedSession
  );
}

export async function appendSessionMessage(
  projectId: string,
  sessionId: string,
  message: ChatMessage
): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const sessions = await readSessions(project);
  const session = sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    throw new Error(`Session was not found: ${sessionId}`);
  }

  const parsedMessage = chatMessageSchema.parse(message);
  const nextSession: PlugSession = {
    ...session,
    messages: [...session.messages, parsedMessage],
    updatedAt: parsedMessage.createdAt
  };

  await writeSession(project, nextSession);
  await writeSessionIndex(project, { version: 1, activeSessionId: nextSession.id });

  return toSnapshot(project, sessions.map((entry) => (entry.id === nextSession.id ? nextSession : entry)), nextSession);
}

export async function replaceSession(projectId: string, session: PlugSession): Promise<SessionSnapshot> {
  const project = await getProjectById(projectId);
  const sessions = await readSessions(project);
  const parsedSession = plugSessionSchema.parse(session);

  await writeSession(project, parsedSession);
  await writeSessionIndex(project, { version: 1, activeSessionId: parsedSession.id });

  return toSnapshot(project, sessions.map((entry) => (entry.id === parsedSession.id ? parsedSession : entry)), parsedSession);
}

export async function updateSessionTitle(
  projectId: string,
  sessionId: string,
  title: string
): Promise<SessionSnapshot> {
  return renameSession(projectId, sessionId, title);
}

export function createChatMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

async function readSessionsWithActive(project: ProjectSummary): Promise<{
  sessions: PlugSession[];
  activeSessionId: string;
}> {
  const sessions = await readSessions(project);

  if (!sessions.length) {
    const snapshot = await createSession(project.id);
    return {
      sessions: [snapshot.session],
      activeSessionId: snapshot.activeSessionId
    };
  }

  const index = await readSessionIndex(project, sessions[0].id);
  return {
    sessions,
    activeSessionId: index.activeSessionId
  };
}

async function readSessions(project: ProjectSummary): Promise<PlugSession[]> {
  await ensureSessionDir(project);

  const entries = await readdir(getSessionDir(project));
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json") && entry !== "index.json")
      .map(async (entry) => {
        const raw = await readFile(join(getSessionDir(project), entry), "utf8");
        return plugSessionSchema.parse(JSON.parse(raw));
      })
  );

  return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function readSessionIndex(project: ProjectSummary, fallbackSessionId: string): Promise<SessionIndex> {
  try {
    const raw = await readFile(join(getSessionDir(project), "index.json"), "utf8");
    const parsed = sessionIndexSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const index: SessionIndex = { version: 1, activeSessionId: fallbackSessionId };
  await writeSessionIndex(project, index);
  return index;
}

async function writeSession(project: ProjectSummary, session: PlugSession): Promise<void> {
  await ensureSessionDir(project);
  await writeFile(join(getSessionDir(project), `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

async function writeSessionIndex(project: ProjectSummary, index: SessionIndex): Promise<void> {
  await ensureSessionDir(project);
  await writeFile(join(getSessionDir(project), "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

async function ensureSessionDir(project: ProjectSummary): Promise<void> {
  await mkdir(getSessionDir(project), { recursive: true });
}

function getSessionDir(project: ProjectSummary): string {
  return join(project.path, ".plug", "sessions");
}

function toSnapshot(project: ProjectSummary, sessions: PlugSession[], activeSession: PlugSession): SessionSnapshot {
  return sessionSnapshotSchema.parse({
    projectId: project.id,
    activeSessionId: activeSession.id,
    sessions: sessions
      .map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        active: session.id === activeSession.id
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    session: activeSession
  });
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
