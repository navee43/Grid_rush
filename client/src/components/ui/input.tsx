import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint",
        "transition-[border-color,box-shadow] focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10",
        "aria-[invalid=true]:border-bad",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
