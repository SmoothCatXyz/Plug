import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { ChatStreamEvent, ToolStreamEvent, UpdateSnapshot } from "../shared/types";
import type { IpcChannel, IpcRequest, IpcResponse, PlugApi } from "../shared/ipc-schema";

const plugApi: PlugApi = {
  invoke: async <TChannel extends IpcChannel>(
    channel: TChannel,
    payload: IpcRequest<TChannel>
  ): Promise<IpcResponse<TChannel>> => {
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<TChannel>>;
  },
  onChatEvent: (listener: (event: ChatStreamEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: ChatStreamEvent): void => {
      listener(payload);
    };

    ipcRenderer.on("chat.event", handler);

    return () => {
      ipcRenderer.removeListener("chat.event", handler);
    };
  },
  onToolEvent: (listener: (event: ToolStreamEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: ToolStreamEvent): void => {
      listener(payload);
    };

    ipcRenderer.on("tool.event", handler);

    return () => {
      ipcRenderer.removeListener("tool.event", handler);
    };
  },
  onUpdateEvent: (listener: (event: UpdateSnapshot) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: UpdateSnapshot): void => {
      listener(payload);
    };

    ipcRenderer.on("update.event", handler);

    return () => {
      ipcRenderer.removeListener("update.event", handler);
    };
  }
};

contextBridge.exposeInMainWorld("plug", plugApi);
