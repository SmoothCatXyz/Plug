/// <reference types="vite/client" />

import type { PlugApi } from "../shared/ipc-schema";

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    plug?: PlugApi;
    webkitAudioContext?: typeof AudioContext;
    __plugAudioContext?: AudioContext;
  }
}

export {};
