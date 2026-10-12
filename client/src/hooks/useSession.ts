import { useCallback, useEffect, useState } from "react";
import { ApiError, api, tokenStore } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";

export type SessionStatus = "loading" | "needs-name" | "ready" | "unreachable";

/** Restores the anonymous player from localStorage, or asks for a name. */
export function useSession() {
  const me = useBoardStore((s) => s.me);
  const setMe = useBoardStore((s) => s.setMe);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const restore = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus("needs-name");
      return;
    }
    setStatus("loading");
    try {
      const { user } = await api.getSession();
      setMe(user);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        setStatus("needs-name");
      } else {
        setStatus("unreachable");
      }
    }
  }, [setMe]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const join = useCallback(
    async (displayName: string) => {
      const { user, token } = await api.createSession(displayName);
      if (token) tokenStore.set(token);
      setMe(user);
      setStatus("ready");
    },
    [setMe],
  );

  /** Called when the server says our token is no longer valid. */
  const expire = useCallback(() => {
    tokenStore.clear();
    setMe(null);
    setStatus("needs-name");
  }, [setMe]);

  return { me, status, join, retry: restore, expire };
}
