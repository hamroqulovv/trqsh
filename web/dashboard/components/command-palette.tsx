"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CornerDownLeft,
  KeyRound,
  LogOut,
  Moon,
  Search,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions";
import { DOCS_URL, navItems } from "@/components/nav-config";
import { useToast } from "@/components/toast";
import { Modal } from "@/components/ui/modal";
import { toggleTheme } from "@/lib/theme-client";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  description?: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  keys?: string[];
  /** Wait for the dialog to finish closing first (the theme sweep). */
  delay?: number;
  run: () => void;
}

const PaletteContext = React.createContext<{ open: () => void; modKey: string } | null>(null);

export function usePalette() {
  const context = React.useContext(PaletteContext);
  if (!context) throw new Error("usePalette needs a <CommandPaletteProvider>");
  return context;
}

/** Ranks a command against what was typed; 0 means no match. */
function score(query: string, command: Command): number {
  const q = query.toLowerCase().trim();
  const label = command.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/\s+/).some((word) => word.startsWith(q))) return 65;
  if (label.includes(q)) return 50;
  if (`${command.keywords ?? ""} ${command.description ?? ""}`.toLowerCase().includes(q)) return 30;
  let matched = 0;
  for (const char of label) if (char === q[matched]) matched++;
  return matched === q.length ? 10 : 0;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [mac, setMac] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const openRef = React.useRef(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);
  React.useEffect(() => setOpen(false), [pathname]);

  const show = React.useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const copy = React.useCallback(
    (text: string, title: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => toast({ title, description: text, tone: "success" }))
        .catch(() => toast({ title: "Could not copy", description: "Clipboard access was blocked.", tone: "error" }));
    },
    [toast],
  );

  const commands = React.useMemo<Command[]>(
    () => [
      ...navItems.map<Command>((item) => ({
        id: `go-${item.href}`,
        label: item.label,
        description: item.description,
        group: "Go to",
        icon: item.icon,
        keys: ["G", item.key.toUpperCase()],
        run: () => router.push(item.href),
      })),
      {
        id: "create-key",
        label: "Create an API key",
        group: "Actions",
        icon: KeyRound,
        keywords: "new token",
        run: () => router.push("/keys"),
      },
      {
        id: "copy-tunnel",
        label: "Copy tunnel command",
        description: "trqsh http 3000",
        group: "Actions",
        icon: Terminal,
        keywords: "start expose cli",
        run: () => copy("trqsh http 3000", "Command copied"),
      },
      {
        id: "copy-install-unix",
        label: "Copy install command (macOS / Linux)",
        group: "Actions",
        icon: Terminal,
        keywords: "curl agent download",
        run: () => copy("curl -fsSL https://trqsh.uz/install.sh | sh", "Install command copied"),
      },
      {
        id: "copy-install-win",
        label: "Copy install command (Windows)",
        group: "Actions",
        icon: Terminal,
        keywords: "powershell agent download",
        run: () => copy("irm https://trqsh.uz/install.ps1 | iex", "Install command copied"),
      },
      {
        id: "toggle-theme",
        label: "Toggle dark mode",
        group: "Preferences",
        icon: Moon,
        keywords: "theme light appearance",
        delay: 230,
        run: () => toggleTheme({ x: window.innerWidth / 2, y: window.innerHeight / 3 }),
      },
      {
        id: "docs",
        label: "Open documentation",
        group: "Preferences",
        icon: BookOpen,
        keywords: "help guide",
        run: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer"),
      },
      {
        id: "logout",
        label: "Log out",
        group: "Preferences",
        icon: LogOut,
        keywords: "sign out",
        run: () => startTransition(() => void logout()),
      },
    ],
    [copy, router],
  );

  const results = React.useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((command) => ({ command, rank: score(query, command) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((entry) => entry.command);
  }, [commands, query]);

  const run = React.useCallback((command: Command) => {
    setOpen(false);
    if (command.delay) window.setTimeout(command.run, command.delay);
    else command.run();
  }, []);

  // ⌘/Ctrl K and "/" open the palette; "g" then a letter jumps to a page.
  React.useEffect(() => {
    let chordAt = 0;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (openRef.current) setOpen(false);
        else show();
        return;
      }
      if (
        isTyping(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        show();
        return;
      }
      const key = event.key.toLowerCase();
      if (chordAt && Date.now() - chordAt < 1200) {
        chordAt = 0;
        const target = navItems.find((item) => item.key === key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "g") chordAt = Date.now();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, show]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[Math.min(active, results.length - 1)]);
    }
  };

  const modKey = mac ? "⌘" : "Ctrl";
  const grouped = !query.trim();
  const activeCommand = results[Math.min(active, results.length - 1)];

  return (
    <PaletteContext.Provider value={{ open: show, modKey }}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="Command palette"
        placement="top"
        className="w-[min(620px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_40px_90px_-30px_rgb(0_0_0/0.65)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            data-autofocus
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={activeCommand ? `palette-${activeCommand.id}` : undefined}
            aria-label="Search pages and actions"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder="Search pages and actions…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div
          ref={listRef}
          id="palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-[min(380px,52vh)] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-secondary">
              Nothing matches <span className="font-medium text-foreground">“{query}”</span>.
            </p>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              const selected = index === Math.min(active, results.length - 1);
              const newGroup = grouped && command.group !== results[index - 1]?.group;
              return (
                <React.Fragment key={command.id}>
                  {newGroup && (
                    <p className="eyebrow px-3 pb-1.5 pt-3 first:pt-1" role="presentation">
                      {command.group}
                    </p>
                  )}
                  <div
                    id={`palette-${command.id}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-100",
                      selected ? "bg-accent" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-150",
                        selected ? "border-border-strong bg-surface text-foreground" : "border-border text-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{command.label}</span>
                      {command.description && (
                        <span className="block truncate text-xs text-muted">{command.description}</span>
                      )}
                    </span>
                    {selected ? (
                      <CornerDownLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    ) : (
                      command.keys && (
                        <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
                          {command.keys.map((key) => (
                            <kbd key={key} className="kbd">
                              {key}
                            </kbd>
                          ))}
                        </span>
                      )
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-border bg-surface-2 px-4 py-2.5 text-xs text-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">↵</kbd> select
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="kbd">G</kbd> then a letter jumps to a page
          </span>
        </div>
      </Modal>
    </PaletteContext.Provider>
  );
}

/** Topbar entry point for the palette. */
export function SearchButton({ className }: { className?: string }) {
  const { open, modKey } = usePalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search pages and actions"
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "group inline-flex h-10 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-sm text-muted transition-[border-color,background-color,color,transform] duration-200 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-[0.97] md:w-56 md:justify-start",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:-rotate-12 group-hover:scale-110" aria-hidden="true" />
      <span className="hidden flex-1 text-left md:inline">Search…</span>
      <span className="hidden items-center gap-1 md:flex" aria-hidden="true">
        <kbd className="kbd">{modKey}</kbd>
        <kbd className="kbd">K</kbd>
      </span>
    </button>
  );
}
