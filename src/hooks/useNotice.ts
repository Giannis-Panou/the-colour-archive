import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One success message at a time. A new message replaces the old one and restarts its timer,
 * so an older message's timeout can never clear a newer one. A duration of 0 keeps it on screen.
 */
export function useNotice() {
  const [notice, setNotice] = useState("");
  const timer = useRef<number | undefined>(undefined);

  const showNotice = useCallback((message: string, duration = 3000) => {
    window.clearTimeout(timer.current);
    setNotice(message);
    if (duration) timer.current = window.setTimeout(() => setNotice(""), duration);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { notice, showNotice };
}
