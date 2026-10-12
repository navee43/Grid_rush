import type { CSSProperties } from "react";

/** Compact key for the tile states, drawn with the same .tile styles as the board. */
export function Legend() {
  const items: Array<{ label: string; state: string; mine?: boolean; latest?: boolean }> = [
    { label: "Free", state: "free" },
    { label: "Claiming", state: "pending" },
    { label: "Taken", state: "owned" },
    { label: "Yours", state: "owned", mine: true },
    { label: "Latest capture", state: "owned", latest: true },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            className="tile pointer-events-none !size-3.5 !animate-none"
            data-state={it.state}
            data-mine={it.mine || undefined}
            data-latest={it.latest || undefined}
            style={
              {
                "--owner": it.mine ? "var(--me)" : "#94a3b8",
                ...(it.latest ? { margin: "0 2px" } : {}),
              } as CSSProperties
            }
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
