import { create } from "zustand";

type Theme = "light" | "dark";
const KEY = "gridrush.theme";

/** Shared theme state; the initial value is set by the inline script in index.html before first paint. */
export const useTheme = create<{ theme: Theme; toggle(): void }>()((set, get) => ({
  theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  toggle() {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    set({ theme: next });
  },
}));
