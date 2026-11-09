import type { Session, User, UserAttributes } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { supabase } from "../lib/supabase";

const AUTH_PARAMS = ["code", "error", "error_code", "error_description"];

/** Reads a sign-in link error (expired, already used) from the address, once. */
function readLinkError(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("error_description");
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
  const message = fromQuery || fromHash;
  if (!message) return "";
  return /expired|invalid/i.test(message)
    ? "That sign-in link has expired or was already used. Request a new one."
    : `Signing in didn't work: ${message}`;
}

/** The Supabase session, including returning from a magic link (?code=…) or a password reset. */
export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);
  const [linkError] = useState(readLinkError);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // Arriving from a "reset your password" email: ask for the new password straight away.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Once Supabase has read the sign-in code, take it (and any error) out of the address.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(location.search);
    if (!AUTH_PARAMS.some((name) => params.has(name))) return;
    AUTH_PARAMS.forEach((name) => params.delete(name));
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
  }, [ready, location.pathname, location.search, location.hash, navigate]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateUser = useCallback(async (changes: UserAttributes): Promise<User> => {
    if (!supabase) throw new Error("Accounts aren't set up on this copy of the app.");
    const { data, error } = await supabase.auth.updateUser(changes);
    if (error) throw error;
    setSession((current) => (current ? { ...current, user: data.user } : current));
    return data.user;
  }, []);

  const user = session?.user ?? null;
  const displayName = user ? (String(user.user_metadata?.display_name ?? "").trim() || user.email?.split("@")[0] || "You") : "";

  return {
    enabled: Boolean(supabase),
    ready,
    user,
    displayName,
    recovering,
    endRecovery: useCallback(() => setRecovering(false), []),
    linkError,
    signOut,
    updateUser,
  };
}

export type Auth = ReturnType<typeof useAuth>;
