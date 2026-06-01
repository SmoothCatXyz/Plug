import * as esbuild from "esbuild-wasm";

let initState: "idle" | "initializing" | "ready" = "idle";
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initState === "ready") return;
  if (initState === "initializing") return initPromise!;

  initState = "initializing";
  initPromise = esbuild
    .initialize({
      // Vite serves the WASM as a static asset; use the package path directly
      wasmURL: new URL("../../node_modules/esbuild-wasm/esbuild.wasm", import.meta.url).href
    })
    .then(() => {
      initState = "ready";
    });

  return initPromise;
}

// Pre-warm the WASM engine on module load so first compilation is fast
void ensureInitialized();

export type TransformResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export async function transformReactJSX(source: string): Promise<TransformResult> {
  try {
    await ensureInitialized();

    const result = await esbuild.transform(source, {
      loader: "tsx",
      format: "cjs",
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      define: {
        "process.env.NODE_ENV": '"development"'
      },
      target: "es2020"
    });

    return { ok: true, code: result.code };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
