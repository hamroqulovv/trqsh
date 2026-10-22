import { Fragment, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Each visual word (or, with split="chars", each glyph) enters independently.
// Words keep their space in the layout throughout and never break mid-word.
//
// The text is rendered once, aria-hidden, so crawlers read a clean heading. Use
// it only inside a heading that carries the full sentence as its aria-label,
// which is what assistive technology announces.
export function AnimatedText({
  text,
  className,
  delay = 0,
  split = "words",
  stagger = split === "chars" ? 26 : 65,
}: {
  text: string;
  className?: string;
  delay?: number;
  split?: "words" | "chars";
  /** Milliseconds between consecutive words or glyphs. */
  stagger?: number;
}) {
  const words = text.split(" ");
  const chars = text.replace(/ /g, "").length;
  let charIndex = 0;

  return (
    <span
      className={cn("animated-text", className)}
      style={{ "--chars": Math.max(chars - 1, 1) } as CSSProperties}
    >
      <span aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={`${word}-${index}`}>
            {split === "chars" ? (
              <span className="animated-chars">
                {Array.from(word).map((char, position) => {
                  const n = charIndex++;
                  return (
                    <span
                      key={position}
                      className="animated-char"
                      style={
                        {
                          "--char": n,
                          "--char-delay": `${delay + n * stagger}ms`,
                        } as CSSProperties
                      }
                    >
                      {char}
                    </span>
                  );
                })}
              </span>
            ) : (
              <span className="animated-word-clip">
                <span
                  className="animated-word"
                  style={{ "--word-delay": `${delay + index * stagger}ms` } as CSSProperties}
                >
                  {word}
                </span>
              </span>
            )}
            {index < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
