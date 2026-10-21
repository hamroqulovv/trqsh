import { Fragment, type ReactNode } from "react";
import { marked, type Token, type Tokens } from "marked";

// Marked escapes text tokens for an HTML renderer. React escapes text itself,
// so decode that layer once to avoid displaying apostrophes as "&#39;".
function decodeText(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value: string) => {
    if (!value.startsWith("#")) return named[value.toLowerCase()] ?? entity;
    const point = value[1].toLowerCase() === "x" ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

// Release notes come from GitHub. Render a small Markdown allowlist as React
// elements: raw HTML is displayed as text and links cannot execute scripts.
function safeHref(href: string): string | undefined {
  try {
    const url = new URL(decodeText(href));
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => {
    const nested = "tokens" in token && token.tokens ? renderTokens(token.tokens) : null;
    switch (token.type) {
      case "space": return null;
      case "heading": return <h3 key={index}>{nested}</h3>;
      case "paragraph": return <p key={index}>{nested}</p>;
      case "text": return <Fragment key={index}>{nested ?? decodeText(token.text)}</Fragment>;
      case "escape": return <Fragment key={index}>{decodeText(token.text)}</Fragment>;
      case "strong": return <strong key={index}>{nested}</strong>;
      case "em": return <em key={index}>{nested}</em>;
      case "del": return <del key={index}>{nested}</del>;
      case "codespan": return <code key={index}>{decodeText(token.text)}</code>;
      case "code": return <pre key={index} tabIndex={0}><code>{token.text}</code></pre>;
      case "br": return <br key={index} />;
      case "hr": return <hr key={index} />;
      case "blockquote": return <blockquote key={index}>{nested}</blockquote>;
      case "link": {
        const href = safeHref((token as Tokens.Link).href);
        return href
          ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{nested}</a>
          : <Fragment key={index}>{nested}</Fragment>;
      }
      case "list": {
        const list = token as Tokens.List;
        const Tag = list.ordered ? "ol" : "ul";
        return <Tag key={index}>{list.items.map((item, itemIndex) =>
          <li key={itemIndex}>{renderTokens(item.tokens)}</li>)}</Tag>;
      }
      default: return <Fragment key={index}>{token.raw}</Fragment>;
    }
  });
}

export function ReleaseMarkdown({ body }: { body: string }) {
  // Link each generated changelog commit to its source, shortening only the
  // displayed SHA. The published note text itself stays in the JSON snapshot.
  const readable = body.replace(
    /^(\s*[*-]\s+)([a-f0-9]{40})\s+/gm,
    (_match, bullet: string, sha: string) => `${bullet}[\`${sha.slice(0, 7)}\`](https://github.com/trqsh-tunnel/trqsh/commit/${sha}) `,
  );
  return <div className="release-notes">{renderTokens(marked.lexer(readable))}</div>;
}
