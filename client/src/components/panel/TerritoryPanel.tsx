import { TOTAL_CELLS } from "@gridrush/shared";
import { useBoardStore } from "@/store/boardStore";
import { useStandings } from "@/hooks/useStandings";

const SEGMENTS = 8;

/**
 * Your count, plus one bar showing how the whole board is split: a segment per
 * leading player in their color, the rest of the players together, then free cells.
 */
export function TerritoryPanel() {
  const me = useBoardStore((s) => s.me);
  const { standings, claimed, available, counts } = useStandings();
  const mine = me ? (counts.get(me.id) ?? 0) : 0;

  const top = standings.slice(0, SEGMENTS);
  const restCount = standings.slice(SEGMENTS).reduce((n, s) => n + s.cells, 0);
  const pct = (n: number) => `${(n / TOTAL_CELLS) * 100}%`;

  return (
    <section aria-labelledby="territory-heading" className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="territory-heading" className="text-sm text-muted">
            Your territory
          </h2>
          <p className="mt-1 font-display text-[40px] font-semibold leading-none tracking-tight tabular">
            {mine}
            <span className="ml-1.5 text-base font-medium text-faint">/ {TOTAL_CELLS}</span>
          </p>
        </div>
        <p className="pb-1 text-right text-sm text-muted tabular">
          {((mine / TOTAL_CELLS) * 100).toFixed(1)}% of the board
        </p>
      </div>

      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line"
        role="img"
        aria-label={`${claimed} of ${TOTAL_CELLS} cells claimed`}
      >
        {top.map((s) => (
          <span
            key={s.user.id}
            className="h-full transition-[width] duration-500 ease-out first:rounded-l-full"
            style={{
              width: pct(s.cells),
              background: s.user.color,
              boxShadow: s.user.id === me?.id ? "inset 0 0 0 1.5px rgb(255 255 255 / 0.7)" : undefined,
            }}
            title={`${s.user.displayName}: ${s.cells}`}
          />
        ))}
        {restCount > 0 && (
          <span className="h-full bg-faint/60 transition-[width] duration-500" style={{ width: pct(restCount) }} />
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Claimed</dt>
          <dd className="font-display text-lg font-semibold tabular">{claimed}</dd>
        </div>
        <div>
          <dt className="text-muted">Still free</dt>
          <dd className="font-display text-lg font-semibold tabular">{available}</dd>
        </div>
      </dl>
    </section>
  );
}
