import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "electron/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "electron/preload.ts")
      }
    }
  },
  renderer: {
    root: rootDir,
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve(rootDir, "renderer"),
        "@shared": resolve(rootDir, "shared")
      }
    },
    build: {
      rollupOptions: {
        input: resolve(rootDir, "index.html")
      }
    }
  }
});
