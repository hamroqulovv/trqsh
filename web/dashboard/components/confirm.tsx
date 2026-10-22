"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger swaps in a warning mark and the strong button style. */
  tone?: "default" | "danger";
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<Confirm | null>(null);

/** `if (!(await confirm({ title: "Revoke key?" }))) return;` */
export function useConfirm(): Confirm {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a <ConfirmProvider>");
  return confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const [open, setOpen] = React.useState(false);
  const resolver = React.useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = React.useCallback<Confirm>((next) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOpen(false);
  };

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={open}
        onClose={() => settle(false)}
        label={options?.title ?? "Confirm"}
        className="w-[min(420px,calc(100vw-32px))] rounded-2xl border border-border-strong bg-surface p-6 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]"
      >
        {options && (
          <>
            <div className="flex items-start gap-4">
              {danger && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                  <TriangleAlert className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">
                  {options.title}
                </h2>
                {options.description && (
                  <p className="mt-1.5 text-sm leading-6 text-secondary">
                    {options.description}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => settle(false)} data-autofocus>
                {options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={danger ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
