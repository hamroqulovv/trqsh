"use client";

import { useEffect, useRef } from "react";

const labels: Record<string, string> = {
  sh: "Shell", bash: "Bash", powershell: "PowerShell",
  text: "trqsh console / output", yaml: "YAML", json: "JSON",
};

function highlightCode(code: HTMLElement, language: string) {
  if (!["sh", "bash", "powershell", "yaml", "json"].includes(language)) return;
  const source = code.textContent ?? "";
  const tokens = /^[\t ]*#[^\n]*|"(?:\\.|[^"\\])*"|'[^'\n]*'|\$\{?[\w:]+\}?|--[a-z][\w-]*|\b(?:true|false|null|\d+)\b|^[\t ]*[\w.-]+(?=:)/gm;
  const fragment = document.createDocumentFragment();
  let end = 0;
  for (const match of source.matchAll(tokens)) {
    fragment.append(document.createTextNode(source.slice(end, match.index)));
    const token = document.createElement("span");
    const text = match[0].trimStart();
    token.className = "docs-token-" + (text.startsWith("#") ? "comment" : /^["']/.test(text) ? "string" : text.startsWith("$") ? "variable" : "keyword");
    token.textContent = match[0];
    fragment.append(token);
    end = match.index! + match[0].length;
  }
  fragment.append(document.createTextNode(source.slice(end)));
  code.replaceChildren(fragment);
}

/** Progressive enhancement: Markdown remains readable without JavaScript. */
export function DocsContent({ html }: { html: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const article = ref.current;
    if (!article) return;
    const abort = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wrappers: { wrapper: HTMLDivElement; pre: HTMLPreElement }[] = [];
    article.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;
      const wrapper = document.createElement("div");
      wrapper.className = "docs-code";
      const toolbar = document.createElement("div");
      toolbar.className = "docs-code-toolbar";
      const label = document.createElement("span");
      const language = code.className.match(/language-([\w-]+)/)?.[1] ?? "";
      highlightCode(code, language);
      label.textContent = labels[language] ?? "Code example";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy " + label.textContent);
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent ?? "");
          if (abort.signal.aborted) return;
          button.textContent = "Copied";
          button.setAttribute("aria-label", "Code copied to clipboard");
        } catch {
          if (abort.signal.aborted) return;
          button.textContent = "Select manually";
          button.setAttribute("aria-label", "Clipboard unavailable; select the code manually");
        }
        const timer = setTimeout(() => {
          button.textContent = "Copy";
          button.setAttribute("aria-label", "Copy " + label.textContent);
          timers.delete(timer);
        }, 2500);
        timers.add(timer);
      }, { signal: abort.signal });
      toolbar.append(label, button);
      pre.before(wrapper);
      wrapper.append(toolbar, pre);
      wrappers.push({ wrapper, pre });
    });
    return () => {
      abort.abort();
      timers.forEach(clearTimeout);
      wrappers.forEach(({ wrapper, pre }) => {
        const code = pre.querySelector("code");
        if (code) code.textContent = code.textContent;
        wrapper.replaceWith(pre);
      });
    };
  }, [html]);
  return <article ref={ref} className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
