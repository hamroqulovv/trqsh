import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, stagger } from "@/lib/utils";

export interface ChecklistItem {
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

/** Setup progress worked out from what the account already has. */
export function SetupChecklist({
  items,
  className,
  style,
}: {
  items: ChecklistItem[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const done = items.filter((item) => item.done).length;
  const complete = done === items.length;
  return (
    <Card spotlight className={cn("rise", className)} style={style}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{complete ? "You're all set" : "Get set up"}</CardTitle>
          <span className="font-mono text-xs tabular text-muted">
            {done}/{items.length}
          </span>
        </div>
        <CardDescription>
          {complete ? "Everything on the list is done." : "A few things worth doing first."}
        </CardDescription>
        <Progress value={(done / items.length) * 100} label="Setup progress" className="mt-2 h-1.5" />
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="flex flex-col">
          {items.map((item, index) => (
            <li key={item.title} className="rise-sm" style={stagger(index + 3)}>
              <Link
                href={item.href}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-200 hover:bg-accent"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                    item.done
                      ? "border-foreground bg-foreground text-page"
                      : "border-dashed border-border-strong text-transparent group-hover:border-foreground/50",
                  )}
                >
                  <Check className={cn("h-3 w-3", item.done && "draw-icon")} strokeWidth={3} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium leading-5", item.done && "text-secondary")}>
                    {item.title}
                    <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{item.hint}</span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 -translate-x-1 text-muted opacity-0 transition-[transform,opacity] duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
