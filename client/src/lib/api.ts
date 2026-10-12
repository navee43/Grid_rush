import type {
  ApiErrorBody,
  BoardSnapshot,
  ClaimResponse,
  ErrorCode,
  LeaderboardResponse,
  SessionResponse,
} from "@gridrush/shared";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const TOKEN_KEY = "gridrush.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: session lasts for this tab only */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | "NETWORK_ERROR" | "TIMEOUT",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  const token = tokenStore.get();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError(0, "TIMEOUT", "The server took too long to answer. Try again.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? `Request failed (${res.status})`,
      e?.details,
    );
  }
  return body as T;
}

export const api = {
  createSession: (displayName: string) =>
    request<SessionResponse>("/api/session", { method: "POST", body: JSON.stringify({ displayName }) }),
  getSession: () => request<SessionResponse>("/api/session"),
  getBoard: () => request<BoardSnapshot>("/api/board"),
  getLeaderboard: (limit = 10) => request<LeaderboardResponse>(`/api/leaderboard?limit=${limit}`),
  claimCell: (cellId: number) => request<ClaimResponse>(`/api/cells/${cellId}/claim`, { method: "POST" }),
};
