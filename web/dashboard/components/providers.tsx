"use client";

import { CommandPaletteProvider } from "@/components/command-palette";
import { ConfirmProvider } from "@/components/confirm";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
