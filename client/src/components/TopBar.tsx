import { Moon, Sun, Users } from "lucide-react";
import { useBoardStore, type ConnectionStatus } from "@/store/boardStore";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const STATUS: Record<ConnectionStatus, { label: string; dot: string; pulse?: boolean }> = {
  connected: { label: "Live", dot: "bg-ok" },
  connecting: { label: "Connecting…", dot: "bg-warn", pulse: true },
  reconnecting: { label: "Reconnecting…", dot: "bg-warn", pulse: true },
  offline: { label: "Offline", dot: "bg-bad" },
};

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
        <rect x="1" y="1" width="10" height="10" rx="2.5" fill="var(--me)" />
        <rect x="13" y="1" width="10" height="10" rx="2.5" className="fill-line-strong" />
        <rect x="1" y="13" width="10" height="10" rx="2.5" className="fill-line-strong" />
        <rect x="13" y="13" width="10" height="10" rx="2.5" className="fill-ink" />
      </svg>
      <span className="font-display text-[22px] font-bold tracking-[-0.02em]">GridRush</span>
    </div>
  );
}

export function TopBar() {
  const me = useBoardStore((s) => s.me);
  const online = useBoardStore((s) => s.online);
  const connection = useBoardStore((s) => s.connection);
  const { theme, toggle } = useTheme();
  const status = STATUS[connection];

  return (
    <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <Wordmark />

      <div className="flex items-center gap-1.5 sm:gap-3">
        <div
          className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px]"
          role="status"
          aria-live="polite"
        >
          <span className={cn("size-2 rounded-full", status.dot, status.pulse && "pulse-dot")} aria-hidden />
          <span className="font-medium">{status.label}</span>
          {connection === "connected" && (
            <>
              <span className="h-3.5 w-px bg-line" aria-hidden />
              <Users className="size-3.5 text-muted" aria-hidden />
              <span className="text-muted tabular">
                {online}
                <span className="sr-only"> players online</span>
              </span>
            </>
          )}
        </div>

        {me && (
          <div className="hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 sm:flex">
            <Avatar user={me} className="size-6 rounded-full text-[10px]" />
            <span className="max-w-[140px] truncate text-sm font-medium">{me.displayName}</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
