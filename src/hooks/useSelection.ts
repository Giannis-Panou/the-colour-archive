import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Select mode for a list: on or off, and which ids are picked. Ids that disappear from the list
 * (deleted, filtered out of existence) drop out of the selection by themselves.
 */
export function useSelection(availableIds: string[]) {
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const available = useMemo(() => new Set(availableIds), [availableIds]);
  const selected = useMemo(() => [...picked].filter((id) => available.has(id)), [picked, available]);

  const toggle = useCallback((id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);
  const selectAll = useCallback((ids: string[]) => setPicked(new Set(ids)), []);
  const start = useCallback(() => { setPicked(new Set()); setActive(true); }, []);
  const stop = useCallback(() => { setActive(false); setPicked(new Set()); }, []);

  // Escape leaves select mode, unless a dialog is open (it closes the dialog instead).
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) stop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, stop]);

  return { active, selected, isSelected: (id: string) => picked.has(id) && available.has(id), toggle, selectAll, start, stop };
}
