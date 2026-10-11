import { Fragment, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The full sentence stays available to assistive technology while each visual
// word enters independently. Words keep their space in the layout throughout.
export function AnimatedText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const words = text.split(" ");

  return (
    <span className={cn("animated-text", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={`${word}-${index}`}>
            <span className="animated-word-clip">
              <span
                className="animated-word"
                style={{ "--word-delay": `${delay + index * 65}ms` } as CSSProperties}
              >
                {word}
              </span>
            </span>
            {index < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
