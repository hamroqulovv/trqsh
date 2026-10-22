"use client";

import * as React from "react";
import { Apple, MonitorCog } from "lucide-react";
import { CommandLine } from "@/components/command-line";
import { Segmented } from "@/components/ui/segmented";

type Platform = "unix" | "windows";

const INSTALL: Record<Platform, { command: string; prompt: string }> = {
  unix: { command: "curl -fsSL https://trqsh.uz/install.sh | sh", prompt: "$" },
  windows: { command: "irm https://trqsh.uz/install.ps1 | iex", prompt: "PS>" },
};

function Step({
  n,
  title,
  last,
  children,
}: {
  n: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute bottom-0 left-3 top-8 w-px bg-border" aria-hidden="true" />}
      <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface font-mono text-[11px] font-medium">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-6">{title}</p>
        <div className="mt-2 flex flex-col gap-2">{children}</div>
      </div>
    </li>
  );
}

/** The three commands to get a tunnel up, with the install line matched to the visitor's OS. */
export function InstallSteps() {
  const [platform, setPlatform] = React.useState<Platform>("unix");
  React.useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setPlatform("windows");
  }, []);
  const install = INSTALL[platform];

  return (
    <ol className="flex flex-col">
      <Step n={1} title="Install the agent">
        <Segmented<Platform>
          label="Operating system"
          value={platform}
          onChange={setPlatform}
          className="w-fit"
          options={[
            { value: "unix", label: "macOS / Linux", icon: Apple },
            { value: "windows", label: "Windows", icon: MonitorCog },
          ]}
        />
        <CommandLine key={platform} text={install.command} prompt={install.prompt} className="rise-sm" />
      </Step>
      <Step n={2} title="Authenticate">
        <CommandLine text="trqsh login" />
      </Step>
      <Step n={3} title="Start a tunnel" last>
        <CommandLine text="trqsh http 3000" />
        <p className="text-xs text-muted">Swap 3000 for the port your app listens on.</p>
      </Step>
    </ol>
  );
}
