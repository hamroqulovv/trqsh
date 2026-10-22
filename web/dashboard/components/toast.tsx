"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  /** Milliseconds on screen. Errors stay a little longer. */
  duration?: number;
}

interface Item extends ToastInput {
  id: number;
}

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(
  null,
);

export function useToast() {
  const toast = React.useContext(ToastContext);
  if (!toast) throw new Error("useToast needs a <ToastProvider>");
  return toast;
}

const icons = { default: Info, success: CheckCircle2, error: AlertCircle };
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const counter = React.useRef(0);

  const toast = React.useCallback((input: ToastInput) => {
    const id = ++counter.current;
    setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...input, id }]);
  }, []);
  const remove = React.useCallback(
    (id: number) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  item,
  onDone,
}: {
  item: Item;
  onDone: (id: number) => void;
}) {
  const tone = item.tone ?? "default";
  const total = item.duration ?? (tone === "error" ? 6000 : 3800);
  const Icon = icons[tone];
  const [leaving, setLeaving] = React.useState(false);
  const remaining = React.useRef(total);
  const startedAt = React.useRef(0);
  const timer = React.useRef<number | undefined>(undefined);

  const leave = React.useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDone(item.id), 220);
  }, [item.id, onDone]);

  const resume = React.useCallback(() => {
    startedAt.current = Date.now();
    timer.current = window.setTimeout(leave, remaining.current);
  }, [leave]);
  const pause = React.useCallback(() => {
    window.clearTimeout(timer.current);
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  React.useEffect(() => {
    resume();
    return () => window.clearTimeout(timer.current);
  }, [resume]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-leaving={leaving ? "" : undefined}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="toast relative w-full overflow-hidden rounded-xl border border-border-strong bg-surface/95 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.5)] backdrop-blur"
    >
      <div className="flex items-start gap-3 p-3.5 pr-2.5">
        <span
          className={cn(
            "mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            tone === "error"
              ? "bg-foreground text-page"
              : "bg-accent text-foreground",
          )}
        >
          <Icon className="draw-icon h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium leading-5">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-5 text-secondary">
              {item.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={leave}
          aria-label="Dismiss notification"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div
        className="toast-timer absolute inset-x-0 bottom-0 h-[2px] bg-foreground/30"
        style={{ "--toast-ms": `${total}ms` } as React.CSSProperties}
        aria-hidden="true"
      />
    </div>
  );
}
