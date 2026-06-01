import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import type { AgentTool } from "./registry";
import { safeProjectPath } from "./project-files";

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx",
  ".css", ".html", ".yaml", ".yml", ".toml", ".csv", ".sh"
]);

const searchFilesInputSchema = z.object({
  pattern: z.string().min(1),
  dir: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  maxResults: z.number().int().min(1).max(50).optional()
});

type SearchFilesInput = z.infer<typeof searchFilesInputSchema>;

type SearchMatch = {
  path: string;
  line: number;
  excerpt: string;
};

async function walkTextFiles(rootDir: string, scanDir: string, results: string[]): Promise<void> {
  let entries;

  try {
    entries = await readdir(scanDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = join(scanDir, entry.name);

    if (entry.isDirectory()) {
      await walkTextFiles(rootDir, fullPath, results);
    } else if (entry.isFile()) {
      const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop() ?? ""}` : "";

      if (TEXT_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
}

export const searchFilesTool: AgentTool<SearchFilesInput> = {
  name: "search_files",
  label: "Search Files",
  description: "Recursively search project text files for a pattern (regex or literal string).",
  category: "file",
  aiWriteLevel: "read",
  parameters: searchFilesInputSchema,
  parameterHints: [
    {
      name: "pattern",
      required: true,
      description: "Regex or literal string to search for."
    },
    {
      name: "dir",
      required: false,
      description: "Project-relative directory to search within. Defaults to project root."
    },
    {
      name: "caseSensitive",
      required: false,
      description: "Whether the search is case-sensitive. Defaults to false."
    },
    {
      name: "maxResults",
      required: false,
      description: "Maximum number of matches to return. Defaults to 20, max 50."
    }
  ],
  async execute(input, context) {
    const maxResults = input.maxResults ?? 20;
    const caseSensitive = input.caseSensitive ?? false;

    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "search_files",
      phase: "running",
      message: `Searching for "${input.pattern}"...`,
      createdAt: new Date().toISOString()
    });

    const scanRoot = input.dir
      ? safeProjectPath(context.project.path, input.dir)
      : context.project.path;

    const scanStats = await stat(scanRoot);

    if (!scanStats.isDirectory()) {
      throw new Error(`Search dir is not a directory: ${input.dir}`);
    }

    let regex: RegExp;

    try {
      regex = new RegExp(input.pattern, caseSensitive ? "g" : "gi");
    } catch {
      const escaped = input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(escaped, caseSensitive ? "g" : "gi");
    }

    const textFiles: string[] = [];
    await walkTextFiles(context.project.path, scanRoot, textFiles);

    const matches: SearchMatch[] = [];

    for (const filePath of textFiles) {
      if (matches.length >= maxResults) {
        break;
      }

      let content: string;

      try {
        content = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) {
          break;
        }

        const line = lines[i] ?? "";
        regex.lastIndex = 0;

        if (regex.test(line)) {
          const relativePath = relative(context.project.path, filePath).replace(/\\/g, "/");
          matches.push({
            path: relativePath,
            line: i + 1,
            excerpt: line.trim().slice(0, 200)
          });
        }
      }
    }

    return {
      summary: `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for "${input.pattern}".`,
      output: {
        pattern: input.pattern,
        matches
      }
    };
  }
};
