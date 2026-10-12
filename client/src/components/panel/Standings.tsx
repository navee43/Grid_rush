import { useBoardStore } from "@/store/boardStore";
import { useStandings, type Standing } from "@/hooks/useStandings";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

const SHOWN = 8;

function Row({ s, isMe }: { s: Standing; isMe: boolean }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[1.5rem_auto_1fr_auto] items-center gap-2.5 rounded-[10px] px-2 py-1.5",
        isMe && "bg-[color-mix(in_srgb,var(--me)_10%,transparent)]",
      )}
    >
      <span className="text-right text-sm text-faint tabular">{s.rank}</span>
      <Avatar user={s.user} />
      <span className="min-w-0 truncate text-sm font-medium">
        {s.user.displayName}
        {isMe && <span className="ml-1.5 text-muted font-normal">(you)</span>}
      </span>
      <span className="text-right tabular">
        <span className="text-sm font-semibold">{s.cells}</span>
        <span className="ml-1.5 inline-block w-12 text-xs text-faint">{s.percent.toFixed(1)}%</span>
      </span>
    </li>
  );
}

export function Standings() {
  const meId = useBoardStore((s) => s.me?.id);
  const { standings } = useStandings();
  const top = standings.slice(0, SHOWN);
  const myRow = standings.find((s) => s.user.id === meId);
  const showMeSeparately = myRow && myRow.rank > SHOWN;

  return (
    <section aria-labelledby="standings-heading" className="rounded-[14px] border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between px-2 pb-2 pt-1">
        <h2 id="standings-heading" className="font-display text-base font-semibold">
          Standings
        </h2>
        <span className="text-xs text-faint">{standings.length} players on the board</span>
      </div>

      {top.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted">Nobody owns a cell yet. Claim one to take first place.</p>
      ) : (
        <ol className="space-y-0.5">
          {top.map((s) => (
            <Row key={s.user.id} s={s} isMe={s.user.id === meId} />
          ))}
          {showMeSeparately && (
            <>
              <li aria-hidden className="mx-2 my-1 border-t border-dashed border-line" />
              <Row s={myRow} isMe />
            </>
          )}
        </ol>
      )}
    </section>
  );
}
