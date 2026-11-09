import { KeyRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { describeAuthError, MIN_PASSWORD_LENGTH } from "../../lib/errors";
import { Modal } from "../Modal";
import { PasswordField } from "./PasswordField";

interface SetPasswordDialogProps {
  onSave: (password: string) => Promise<void>;
  onClose: () => void;
}

/** Shown after opening a "reset your password" email. */
export function SetPasswordDialog({ onSave, onClose }: SetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setWorking(true);
    setError("");
    try {
      await onSave(password);
    } catch (saveError) {
      console.error("Could not set the password:", saveError);
      setError(describeAuthError(saveError, "Your password couldn't be saved. Try again in a moment."));
      setWorking(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="set-password-title" className="collection-delete-dialog sign-in-dialog" backdropClassName="collection-delete-backdrop" closeOnBackdrop={false}>
      <button className="modal-close sign-in-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
      <span className="confirm-icon import-icon"><KeyRound size={18} /></span>
      <form onSubmit={submit} className="sign-in-form" noValidate>
        <h2 id="set-password-title">Choose a new password</h2>
        <p>You're signed in. Pick a password to use next time.</p>
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
        <PasswordField id="confirm-password" label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="confirm-actions">
          <button type="button" onClick={onClose} disabled={working}>Not now</button>
          <button type="submit" className="confirm-primary" disabled={working}>{working ? "Saving…" : "Save password"}</button>
        </div>
      </form>
    </Modal>
  );
}
