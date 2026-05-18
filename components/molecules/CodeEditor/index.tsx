"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";

// Monaco is heavy — dynamic-import with no SSR so it never lands in the server bundle
// and stays out of any page that doesn't actively render <CodeEditor/>.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#1e1e1e] text-ink-3 flex items-center justify-center text-sm">
      Loading editor…
    </div>
  ),
});

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Monaco language id — defaults to 'html'. */
  language?: string;
  /** Optional className passthrough for the outer wrapper. */
  className?: string;
  ariaLabel?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language = "html",
  className,
  ariaLabel,
}: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [ready, setReady] = useState(false);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    setReady(true);

    // VS Code "dark+" feel that matches the rest of the dark editor surface.
    monaco.editor.defineTheme("apna-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0b0f14",
        "editor.lineHighlightBackground": "#11181f",
        "editorLineNumber.foreground": "#3b4754",
        "editorLineNumber.activeForeground": "#7aa896",
      },
    });
    monaco.editor.setTheme("apna-dark");

    if (ariaLabel) {
      editor.updateOptions({ ariaLabel });
    }
  };

  // Keep the editor sized to its container on viewport changes.
  useEffect(() => {
    if (!ready) return;
    const onResize = () => editorRef.current?.layout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready]);

  return (
    <div className={className ?? "w-full h-full bg-[#0b0f14]"}>
      <MonacoEditor
        height="100%"
        width="100%"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        theme="apna-dark"
        options={{
          fontSize: 13,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', 'Roboto Mono', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          renderLineHighlight: "line",
          formatOnPaste: true,
          quickSuggestions: { strings: true, other: true, comments: true },
          padding: { top: 12, bottom: 12 },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  );
}
