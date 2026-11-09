import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import type { SharedLinkState } from "../types";
import { initialShareState, readShareAddress, resolveShare } from "../lib/sharing";

/** The share in the current address (/s/code, #s=… or #share=…), resolved and validated. */
export function useSharedLink(): SharedLinkState {
  const { pathname, hash } = useLocation();
  const address = useMemo(() => readShareAddress(pathname, hash), [pathname, hash]);
  const key = address ? JSON.stringify(address) : "";
  // Old #share= links decode synchronously; the others show "loading" until resolved below.
  const immediate = useMemo(() => initialShareState(address), [address]);
  const [resolved, setResolved] = useState<{ key: string; state: SharedLinkState } | null>(null);

  useEffect(() => {
    if (immediate?.status !== "loading") return undefined;
    let cancelled = false;
    resolveShare(address).then((state) => { if (!cancelled) setResolved({ key, state }); });
    return () => { cancelled = true; };
  }, [address, immediate, key]);

  if (immediate?.status !== "loading") return immediate;
  return resolved?.key === key ? resolved.state : immediate;
}
