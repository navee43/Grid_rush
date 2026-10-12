import { useEffect } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Toaster } from "sonner";
import { TOTAL_CELLS } from "@gridrush/shared";
import { TopBar } from "@/components/TopBar";
import { Board } from "@/components/board/Board";
import { Legend } from "@/components/board/Legend";
import { TerritoryPanel } from "@/components/panel/TerritoryPanel";
import { Standings } from "@/components/panel/Standings";
import { ActivityFeed } from "@/components/panel/ActivityFeed";
import { JoinDialog } from "@/components/JoinDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogTrigger, DrawerContent } from "@/components/ui/dialog";
import { useSession } from "@/hooks/useSession";
import { useBoardSocket } from "@/hooks/useBoardSocket";
import { useClaim } from "@/hooks/useClaim";
import { useStandings } from "@/hooks/useStandings";
import { useBoardStore } from "@/store/boardStore";
import { useTheme } from "@/hooks/useTheme";

function SidePanel() {
  return (
    <div className="flex flex-col gap-3">
      <TerritoryPanel />
      <Standings />
      <ActivityFeed />
    </div>
  );
}

/** Small screens: a one-line summary under the board and the full panel in a drawer. */
function MobileSummary() {
  const me = useBoardStore((s) => s.me);
  const { counts, available } = useStandings();
  const mine = me ? (counts.get(me.id) ?? 0) : 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 lg:hidden">
      <p className="text-sm">
        <span className="font-display text-lg font-semibold tabular">{mine}</span>
        <span className="text-muted"> yours</span>
        <span className="mx-2 text-line-strong" aria-hidden>
          /
        </span>
        <span className="font-display text-lg font-semibold tabular">{available}</span>
        <span className="text-muted"> of {TOTAL_CELLS} free</span>
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <BarChart3 />
            Standings
          </Button>
        </DialogTrigger>
        <DrawerContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Standings and captures</DialogTitle>
          <SidePanel />
        </DrawerContent>
      </Dialog>
    </div>
  );
}

export default function App() {
  const { me, status, join, retry, expire } = useSession();
  const reset = useBoardStore((s) => s.reset);
  const claim = useClaim(expire);
  const theme = useTheme((s) => s.theme);

  useBoardSocket(me?.id, expire);

  // Your color becomes the interface accent.
  useEffect(() => {
    document.documentElement.style.setProperty("--me", me?.color ?? "#3b82f6");
  }, [me?.color]);

  // Signing out (expired token) clears the local mirror of the board.
  useEffect(() => {
    if (!me) reset();
  }, [me, reset]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 gap-4 px-3 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <section aria-label="Board" className="flex min-w-0 flex-col items-center gap-3">
          <div className="w-full max-w-[min(100%,calc(100dvh-170px))] min-w-[280px]">
            <Board onClaim={claim} />
          </div>
          <div className="flex w-full max-w-[min(100%,calc(100dvh-170px))] flex-col gap-3">
            <Legend />
            <MobileSummary />
          </div>
        </section>

        <aside className="hidden lg:block" aria-label="Standings and activity">
          <SidePanel />
        </aside>
      </main>

      {status === "unreachable" && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 text-sm shadow-lg">
          Can't reach the server.
          <Button size="sm" variant="outline" onClick={() => void retry()}>
            <RefreshCw />
            Try again
          </Button>
        </div>
      )}

      <JoinDialog open={status === "needs-name"} onJoin={join} />
      <Toaster position="bottom-center" theme={theme} richColors={false} closeButton={false} />
    </div>
  );
}
