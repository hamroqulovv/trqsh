"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { centerOf, setThemePref, useTheme, type ThemePref } from "@/lib/theme-client";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Light, dark, or follow the device. The new theme spreads out from the control. */
export function ThemeSegmented({ className }: { className?: string }) {
  const { pref } = useTheme();
  return (
    <Segmented<ThemePref>
      label="Theme"
      options={[...options]}
      value={pref}
      className={className}
      onChange={(next, origin) => setThemePref(next, centerOf(origin))}
    />
  );
}
