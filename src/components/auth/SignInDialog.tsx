import { KeyRound, Mail, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { describeAuthError, MIN_PASSWORD_LENGTH } from "../../lib/errors";
import { homeUrl } from "../../lib/sharing";
import { requireSupabase } from "../../lib/supabase";
import { Modal } from "../Modal";
import { PasswordField } from "./PasswordField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Method = "password" | "link";
type Mode = "signin" | "signup" | "forgot";
type Sent = "link" | "confirm" | "reset";

const SENT_COPY: Record<Sent, [string, string]> = {
  link: ["Check your inbox", "We sent a sign-in link to"],
  confirm: ["Confirm your email", "Your account is created. To finish, open the confirmation link we sent to"],
  reset: ["Check your inbox", "If there's an account for this address, a password reset link is on its way to"],
};

/** Sign in with a password or an emailed link; also creates accounts and sends password resets. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [method, setMethod] = useState<Method>("password");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState("");

  function switchTo(nextMethod: Method, nextMode: Mode = "signin") {
    setMethod(nextMethod);
    setMode(nextMode);
    setError("");
    setSent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) return setError("Enter a full email address, like name@example.com.");
    if (method === "password" && mode !== "forgot" && !password) return setError("Enter your password.");
    if (method === "password" && mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    }
    setWorking(true);
    setError("");
    const auth = requireSupabase().auth;
    try {
      if (method === "link") {
        const { error: linkError } = await auth.signInWithOtp({ email: address, options: { emailRedirectTo: homeUrl() } });
        if (linkError) throw linkError;
        setSent("link");
      } else if (mode === "signin") {
        const { error: signInError } = await auth.signInWithPassword({ email: address, password });
        if (signInError) throw signInError;
        onClose();
        return;
      } else if (mode === "signup") {
        const { data, error: signUpError } = await auth.signUp({ email: address, password, options: { emailRedirectTo: homeUrl() } });
        if (signUpError) throw signUpError;
        // Supabase hides whether an address is registered: an existing account comes back with no identities.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode("signin");
          setError("There's already an account for this email. Sign in instead, or choose “Forgot password?”.");
          return;
        }
        if (data.session) {
          onClose();
          return;
        }
        setSent("confirm");
      } else {
        const { error: resetError } = await auth.resetPasswordForEmail(address, { redirectTo: homeUrl() });
        if (resetError) throw resetError;
        setSent("reset");
      }
    } catch (authError) {
      console.error("Sign-in step failed:", authError);
      setError(describeAuthError(authError, "That didn't work. Check your details and connection, then try again."));
    } finally {
      setWorking(false);
    }
  }

  const title = method === "link" ? "Sync your archive" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in";
  const intro = method === "link"
    ? "We'll email you a link that signs you in. No password needed."
    : mode === "signup" ? "Save your mixes to your account and use them on any device."
      : mode === "forgot" ? "Enter your account email and we'll send you a link to choose a new password."
        : "Sign in to keep your mixes in your account and use them on any device.";
  const submitLabel = working ? "Please wait…"
    : method === "link" ? "Email me a sign-in link"
      : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in";

  return (
    <Modal onClose={onClose} labelledBy="sign-in-title" describedBy="sign-in-description" className="collection-delete-dialog sign-in-dialog" backdropClassName="collection-delete-backdrop">
      <button className="modal-close sign-in-close" onClick={onClose} aria-label="Close sign in"><X size={17} /></button>
      <span className="confirm-icon import-icon">{method === "link" || sent ? <Mail size={18} /> : <KeyRound size={18} />}</span>
      {sent ? (
        <>
          <h2 id="sign-in-title">{SENT_COPY[sent][0]}</h2>
          <p id="sign-in-description">{SENT_COPY[sent][1]} <strong>{email.trim()}</strong>. Open it on this device, in this browser.</p>
          <p className="sign-in-hint">No email after a minute? Check your spam folder.</p>
          <div className="confirm-actions">
            <button onClick={() => switchTo(method, sent === "reset" ? "signin" : mode)}>Back</button>
            <button className="confirm-primary" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="sign-in-form" noValidate>
          <h2 id="sign-in-title">{title}</h2>
          <p id="sign-in-description">{intro}</p>
          {mode !== "forgot" && (
            <div className="segmented" role="tablist" aria-label="How to sign in">
              <button type="button" role="tab" aria-selected={method === "password"} className={method === "password" ? "selected" : ""} onClick={() => switchTo("password", mode === "signup" ? "signup" : "signin")}>
                <KeyRound size={14} /> Password
              </button>
              <button type="button" role="tab" aria-selected={method === "link"} className={method === "link" ? "selected" : ""} onClick={() => switchTo("link")}>
                <Mail size={14} /> Email link
              </button>
            </div>
          )}
          <label className="field-label sign-in-field" htmlFor="sign-in-email">
            <span className="field-label-text">Email address</span>
            <input id="sign-in-email" className="text-input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoFocus />
          </label>
          {method === "password" && mode !== "forgot" && (
            <PasswordField
              id="sign-in-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              hint={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters.` : ""}
            />
          )}
          {method === "password" && mode === "signin" && (
            <button type="button" className="text-button forgot-link" onClick={() => switchTo("password", "forgot")}>Forgot password?</button>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="confirm-actions">
            <button type="button" onClick={mode === "forgot" ? () => switchTo("password") : onClose}>{mode === "forgot" ? "Back" : "Cancel"}</button>
            <button type="submit" className="confirm-primary" disabled={working}>{submitLabel}</button>
          </div>
          {method === "password" && mode !== "forgot" && (
            <p className="sign-in-switch">
              {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
              <button type="button" className="text-button" onClick={() => switchTo("password", mode === "signup" ? "signin" : "signup")}>
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
