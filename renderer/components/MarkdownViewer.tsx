import { isValidElement, useEffect, useState } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { transformReactJSX } from "../services/esbuild-service";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdown.css";

type MarkdownViewerProps = {
  content: string;
  onOpenDocumentPath: (path: string) => Promise<void> | void;
};

export function MarkdownViewer({ content, onOpenDocumentPath }: MarkdownViewerProps): ReactElement {
  const components: Components = {
    a({ node: _node, href, children, ...anchorProps }) {
      const isProjectLink = Boolean(href && isProjectDocumentHref(href));

      function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
        if (!href || !isProjectLink) {
          return;
        }

        event.preventDefault();
        void onOpenDocumentPath(href);
      }

      return (
        <a
          {...anchorProps}
          href={href}
          data-project-link={isProjectLink ? "true" : undefined}
          onClick={handleClick}
        >
          {children}
        </a>
      );
    },
    pre({ children }) {
      const artifact = extractArtifactCodeBlock(children);

      if (!artifact) {
        return <pre>{children}</pre>;
      }

      return <ArtifactCodeBlock language={artifact.language} code={artifact.code} />;
    }
  };

  return (
    <div className="markdown-document">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

type ArtifactCodeBlockProps = {
  language: string;
  code: string;
};

function ArtifactCodeBlock({ language, code }: ArtifactCodeBlockProps): ReactElement {
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage === "react") {
    return <ReactArtifactBlock code={code} />;
  }

  const sandboxAttr = normalizedLanguage === "mermaid" ? "allow-scripts" : "";

  let srcDoc: string;
  if (normalizedLanguage === "svg") {
    srcDoc = renderSvgPreviewDocument(code);
  } else if (normalizedLanguage === "mermaid") {
    srcDoc = renderMermaidPreviewDocument(code);
  } else {
    srcDoc = renderHtmlPreviewDocument(code);
  }

  return (
    <figure className={`artifact-preview artifact-preview--${normalizedLanguage}`}>
      <figcaption>
        <span>{artifactLabel(normalizedLanguage)}</span>
        <em>SANDBOX PREVIEW</em>
      </figcaption>
      <iframe
        title={`${normalizedLanguage.toUpperCase()} artifact preview`}
        sandbox={sandboxAttr}
        srcDoc={srcDoc}
      />
      <pre className="artifact-preview__source">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function ReactArtifactBlock({ code }: { code: string }): ReactElement {
  const [state, setState] = useState<
    | { status: "compiling" }
    | { status: "ready"; srcDoc: string }
    | { status: "error"; message: string }
  >({ status: "compiling" });

  useEffect(() => {
    let cancelled = false;
    void transformReactJSX(code).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "ready", srcDoc: renderReactPreviewDocument(result.code) });
      } else {
        setState({ status: "error", message: result.error });
      }
    });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <figure className="artifact-preview artifact-preview--react">
      <figcaption>
        <span>React Component</span>
        <em>
          {state.status === "compiling" ? "COMPILING..." : state.status === "error" ? "COMPILE ERROR" : "SANDBOX PREVIEW"}
        </em>
      </figcaption>
      {state.status === "ready" ? (
        <iframe
          title="React artifact preview"
          sandbox="allow-scripts"
          srcDoc={state.srcDoc}
        />
      ) : state.status === "error" ? (
        <div className="artifact-preview__error">
          <strong>Compilation error</strong>
          <pre>{state.message}</pre>
        </div>
      ) : (
        <div className="artifact-preview__pending">
          <strong>Compiling React component...</strong>
        </div>
      )}
      <pre className="artifact-preview__source">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function extractArtifactCodeBlock(children: ReactNode): { language: string; code: string } | null {
  if (!isValidElement(children)) {
    return null;
  }

  const props = children.props as {
    className?: string;
    children?: ReactNode;
  };
  const language = props.className?.match(/language-(\w+)/)?.[1]?.toLowerCase();

  if (!language || !["html", "svg", "mermaid", "react"].includes(language)) {
    return null;
  }

  return {
    language,
    code: String(props.children ?? "").replace(/\n$/, "")
  };
}

function artifactLabel(language: string): string {
  if (language === "html") {
    return "HTML Artifact";
  }

  if (language === "svg") {
    return "SVG Artifact";
  }

  if (language === "mermaid") {
    return "Mermaid Diagram";
  }

  if (language === "react") {
    return "React Component";
  }

  return "Code Artifact";
}

function renderHtmlPreviewDocument(code: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />",
    "<style>",
    "html,body{margin:0;min-height:100%;color-scheme:dark;background:Canvas;color:CanvasText;font-family:system-ui,sans-serif;}",
    "body{padding:16px;box-sizing:border-box;}",
    "*{box-sizing:border-box;}",
    "</style>",
    "</head>",
    "<body>",
    code,
    "</body>",
    "</html>"
  ].join("");
}

function renderMermaidPreviewDocument(code: string): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>body{margin:0;background:#0a0e14;display:flex;justify-content:center;align-items:center;min-height:100vh}.mermaid{max-width:100%;color:#e5f2ff}</style>
</head><body>
<div class="mermaid">${escaped}</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<script>mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#00d9ff',primaryTextColor:'#e5f2ff',lineColor:'#4a5868',background:'#0a0e14'}})<\/script>
</body></html>`;
}

function renderReactPreviewDocument(compiledCjs: string): string {
  // The compiled CJS code uses React.createElement — load React from CDN then execute
  const escaped = compiledCjs
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\${/g, "\\${");

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
html,body{margin:0;min-height:100%;color-scheme:dark;background:#0a0e14;color:#e5f2ff;font-family:system-ui,sans-serif;}
body{padding:16px;box-sizing:border-box;}*{box-sizing:border-box;}
</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
</head><body>
<div id="root"></div>
<script>
(function(){
  var module={exports:{}};
  var exports=module.exports;
  try{
    (function(module,exports,React,require){
      ${compiledCjs}
    })(module,module.exports,React,function(id){
      if(id==='react')return React;
      if(id==='react-dom')return ReactDOM;
      return {};
    });
    var Component=module.exports.default||module.exports[Object.keys(module.exports)[0]];
    if(typeof Component==='function'){
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));
    } else {
      document.getElementById('root').textContent='No default export found. Export a React component as default.';
    }
  } catch(e) {
    document.getElementById('root').innerHTML='<pre style="color:#ff6b6b;font-size:12px">'+e.toString()+'</pre>';
  }
})();
<\/script>
</body></html>`;
}

function renderSvgPreviewDocument(code: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />",
    "<style>",
    "html,body{margin:0;width:100%;height:100%;color-scheme:dark;background:Canvas;display:grid;place-items:center;}",
    "svg{max-width:100%;max-height:100%;}",
    "</style>",
    "</head>",
    "<body>",
    code,
    "</body>",
    "</html>"
  ].join("");
}

function isProjectDocumentHref(href: string): boolean {
  const trimmedHref = href.trim();

  if (!trimmedHref || trimmedHref.startsWith("#")) {
    return false;
  }

  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedHref) && !trimmedHref.startsWith("//");
}
