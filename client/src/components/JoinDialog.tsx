import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { displayNameSchema } from "@gridrush/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

interface JoinDialogProps {
  open: boolean;
  onJoin(name: string): Promise<void>;
}

/** First-visit prompt. Can't be dismissed: you need a name to play. */
export function JoinDialog({ open, onJoin }: JoinDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Pick a different name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onJoin(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="join-desc"
      >
        <DialogTitle>Pick a name to start claiming</DialogTitle>
        <DialogDescription id="join-desc" className="mt-1.5">
          Everyone shares one 30×30 board. Click a free cell to make it yours — once it's taken, it stays taken. You'll
          get a color when you join.
        </DialogDescription>

        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          <label htmlFor="display-name" className="block text-sm font-medium">
            Display name
          </label>
          <Input
            id="display-name"
            autoFocus
            autoComplete="nickname"
            maxLength={24}
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "name-error" : "name-hint"}
          />
          {error ? (
            <p id="name-error" className="text-sm text-bad" role="alert">
              {error}
            </p>
          ) : (
            <p id="name-hint" className="text-sm text-faint">
              2–24 characters. Other players see this next to your cells.
            </p>
          )}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Join the board
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
