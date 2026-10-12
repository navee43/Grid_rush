import { formatCell } from "@gridrush/shared";
import { useBoardStore } from "@/store/boardStore";
import { useNow } from "@/hooks/useNow";
import { timeAgo } from "@/lib/utils";

export function ActivityFeed() {
  const activity = useBoardStore((s) => s.activity);
  const meId = useBoardStore((s) => s.me?.id);
  const now = useNow();

  return (
    <section aria-labelledby="activity-heading" className="rounded-[14px] border border-line bg-surface p-3">
      <h2 id="activity-heading" className="px-2 pb-2 pt-1 font-display text-base font-semibold">
        Captures
      </h2>
      {activity.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted">New captures appear here the moment they happen.</p>
      ) : (
        <ol className="max-h-72 space-y-px overflow-y-auto" aria-live="polite" aria-relevant="additions">
          {activity.map((a) => (
            <li
              key={`${a.cellId}:${a.version}`}
              className="rise-in flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
            >
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: a.owner.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{a.owner.id === meId ? "You" : a.owner.displayName}</span>
                <span className="text-muted"> claimed </span>
                <span className="tabular">{formatCell(a.cellId)}</span>
              </span>
              <time className="shrink-0 text-xs text-faint tabular" dateTime={a.claimedAt}>
                {timeAgo(a.claimedAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
