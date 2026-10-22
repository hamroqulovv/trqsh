import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";

/** A shell command with a copy button. */
export function CommandLine({
  text,
  prompt = "$",
  className,
}: {
  text: string;
  prompt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "command-line flex items-center justify-between gap-2 rounded-lg border border-border bg-page py-1.5 pl-3 pr-1.5",
        className,
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-secondary">
        <span className="select-none text-muted">{prompt} </span>
        {text}
      </code>
      <CopyButton value={text} label="" />
    </div>
  );
}
