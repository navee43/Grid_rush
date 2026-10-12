import type { PublicUser } from "@gridrush/shared";
import { cn, initials, readableOn } from "@/lib/utils";

export function Avatar({ user, className }: { user: PublicUser; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-lg font-display text-[11px] font-semibold",
        className,
      )}
      style={{ background: user.color, color: readableOn(user.color) }}
      aria-hidden
    >
      {initials(user.displayName)}
    </span>
  );
}
