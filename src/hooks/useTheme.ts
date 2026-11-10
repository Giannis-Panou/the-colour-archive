import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

// public/theme.js reads the same key before the page paints, so a saved theme never flashes.
export const THEME_KEY = "the-colour-archive-theme";
const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const THEME_COLORS = { light: "#ebece8", dark: "#151a18" };

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

const systemPrefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Light, dark, or following the device. Applied as data-theme on <html>; "system" removes it. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const resolved = choice === "system" ? (systemDark ? "dark" : "light") : choice;

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") delete root.dataset.theme;
    else root.dataset.theme = choice;
    // Phones tint their status bar with theme-color.
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", THEME_COLORS[resolved]));
  }, [choice, resolved]);

  const cycle = useCallback(() => {
    setChoice((current) => {
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      try {
        if (next === "system") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, next);
      } catch { /* storage unavailable: the choice lasts for this visit */ }
      return next;
    });
  }, []);

  return { choice, resolved, cycle };
}
