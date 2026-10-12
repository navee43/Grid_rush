import { useMemo } from "react";
import { TOTAL_CELLS, type PublicUser } from "@gridrush/shared";
import { useBoardStore } from "@/store/boardStore";

export interface Standing {
  rank: number;
  user: PublicUser;
  cells: number;
  percent: number;
}

/**
 * Live standings derived from the board the client already holds (a mirror of
 * the database via snapshot + events), so no extra network traffic per claim.
 * Same ordering rule as GET /api/leaderboard: most cells, then earliest player.
 */
export function useStandings() {
  const cells = useBoardStore((s) => s.cells);
  const owners = useBoardStore((s) => s.owners);

  return useMemo(() => {
    const counts = new Map<string, number>();
    let claimed = 0;
    for (const c of cells) {
      if (!c?.ownerId) continue;
      claimed++;
      counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
    }

    const standings: Standing[] = [...counts.entries()]
      .filter(([id]) => owners[id])
      .sort(([idA, a], [idB, b]) => b - a || (idA < idB ? -1 : 1))
      .map(([id, n], i) => ({
        rank: i + 1,
        user: owners[id]!,
        cells: n,
        percent: Math.round((n / TOTAL_CELLS) * 10_000) / 100,
      }));

    return { standings, claimed, available: TOTAL_CELLS - claimed, counts };
  }, [cells, owners]);
}
