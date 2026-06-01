import { ipcMain } from "electron";
import { ipcSchemas, type IpcChannel, type IpcRequest, type IpcResponse } from "../../shared/ipc-schema";

type IpcHandler<TChannel extends IpcChannel> = (
  payload: IpcRequest<TChannel>
) => Promise<IpcResponse<TChannel>> | IpcResponse<TChannel>;

export function registerIpcHandler<TChannel extends IpcChannel>(
  channel: TChannel,
  handler: IpcHandler<TChannel>
): void {
  const schemas = ipcSchemas[channel];

  ipcMain.handle(channel, async (_event, rawPayload: unknown) => {
    const payload = schemas.request.parse(rawPayload) as IpcRequest<TChannel>;
    const result = await handler(payload);

    return schemas.response.parse(result);
  });
}
