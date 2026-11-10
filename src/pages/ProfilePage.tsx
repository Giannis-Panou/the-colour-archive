import type { User, UserAttributes } from "@supabase/supabase-js";
import { Archive, Download, LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Collection, Mix } from "../types";
import { PasswordField } from "../components/auth/PasswordField";
import { describeAuthError, MIN_PASSWORD_LENGTH } from "../lib/errors";

type Status = { state: "idle" | "working" | "done" | "error"; message: string };
const IDLE: Status = { state: "idle", message: "" };

const longDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function StatusLine({ status }: { status: Status }) {
  if (!status.message) return null;
  return <div className={status.state === "error" ? "form-error" : "form-success"} role={status.state === "error" ? "alert" : "status"}>{status.message}</div>;
}

interface ProfilePageProps {
  user: User;
  displayName: string;
  mixes: Mix[];
  collections: Collection[];
  onUpdateUser: (changes: UserAttributes) => Promise<User>;
  onExport: () => void;
  onSignOut: () => void;
  onViewMix: (mix: Mix) => void;
}

export function ProfilePage({ user, displayName, mixes, collections, onUpdateUser, onExport, onSignOut, onViewMix }: ProfilePageProps) {
  const savedName = String(user.user_metadata?.display_name ?? "");
  const [name, setName] = useState(savedName);
  const [nameStatus, setNameStatus] = useState<Status>(IDLE);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(IDLE);

  const joined = longDate.format(new Date(user.created_at));
  const lastSignIn = user.last_sign_in_at ? dateTime.format(new Date(user.last_sign_in_at)) : "—";
  const brandCounts = new Map<string, number>();
  mixes.forEach((mix) => mix.paints.forEach((paint) => brandCounts.set(paint.brand, (brandCounts.get(paint.brand) || 0) + 1)));
  const favouriteBrand = [...brandCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const stats: [string, number][] = [
    ["Mixes", mixes.length],
    ["Collections", collections.length],
    ["Photos", mixes.filter((mix) => mix.image).length],
    ["Unique paints", new Set(mixes.flatMap((mix) => mix.paints.map((paint) => `${paint.brand}:${paint.name}`))).size],
  ];
  const recentColours = [...mixes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length > 40) return setNameStatus({ state: "error", message: "Keep your name to 40 characters or fewer." });
    setNameStatus({ state: "working", message: "" });
    try {
      await onUpdateUser({ data: { display_name: clean } });
      setName(clean);
      setNameStatus({ state: "done", message: clean ? "Name saved." : "Name cleared. Your email name is shown instead." });
    } catch (error) {
      console.error("Could not save the display name:", error);
      setNameStatus({ state: "error", message: describeAuthError(error, "Your name couldn't be saved. Try again in a moment.") });
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setPasswordStatus({ state: "error", message: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` });
    if (password !== confirm) return setPasswordStatus({ state: "error", message: "The two passwords don't match." });
    setPasswordStatus({ state: "working", message: "" });
    try {
      await onUpdateUser({ password });
      setPassword("");
      setConfirm("");
      setPasswordStatus({ state: "done", message: "Password saved. You can now sign in with your email and this password." });
    } catch (error) {
      console.error("Could not change the password:", error);
      setPasswordStatus({ state: "error", message: describeAuthError(error, "Your password couldn't be saved. Try again in a moment.") });
    }
  }

  return (
    <div className="profile-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR ACCOUNT</div>
          <h1>{displayName}{!/[.!?]$/.test(displayName) && <span className="heading-period">.</span>}</h1>
          <p className="heading-subtitle">Member since {joined}. Your archive is synced to this account.</p>
        </div>
        <Link className="sort-button" to="/"><Archive size={15} /> Back to my archive</Link>
      </div>

      <section className="summary-row profile-stats" aria-label="Archive statistics">
        {stats.map(([label, value]) => (
          <div className="summary-card" key={label}>
            <span className="summary-copy"><span className="summary-label">{label.toUpperCase()}</span><strong>{value}</strong></span>
          </div>
        ))}
      </section>

      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-details-title">
          <h2 id="profile-details-title">Details</h2>
          <form onSubmit={saveName} className="profile-form">
            <label className="field-label" htmlFor="profile-name">
              <span className="field-label-text">Display name <span className="optional-label">OPTIONAL</span></span>
              <input id="profile-name" className="text-input" value={name} maxLength={40} onChange={(event) => { setName(event.target.value); setNameStatus(IDLE); }} placeholder={user.email?.split("@")[0]} autoComplete="nickname" />
            </label>
            <StatusLine status={nameStatus} />
            <button className="primary-button" type="submit" disabled={nameStatus.state === "working" || name.trim() === savedName}>
              {nameStatus.state === "working" ? "Saving…" : "Save name"}
            </button>
          </form>
          <dl className="profile-facts">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Member since</dt><dd>{joined}</dd></div>
            <div><dt>Last sign-in</dt><dd>{lastSignIn}</dd></div>
            <div><dt>Favourite brand</dt><dd>{favouriteBrand}</dd></div>
          </dl>
        </section>

        <section className="profile-card" aria-labelledby="profile-password-title">
          <h2 id="profile-password-title">Password</h2>
          <p className="profile-help">Set a password to sign in without waiting for an email, or change the one you have. Email links keep working either way.</p>
          <form onSubmit={savePassword} className="profile-form">
            <PasswordField id="profile-new-password" label="New password" value={password} onChange={(value) => { setPassword(value); setPasswordStatus(IDLE); }} autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
            <PasswordField id="profile-confirm-password" label="Type it again" value={confirm} onChange={(value) => { setConfirm(value); setPasswordStatus(IDLE); }} autoComplete="new-password" />
            <StatusLine status={passwordStatus} />
            <button className="primary-button" type="submit" disabled={passwordStatus.state === "working" || !password}>
              {passwordStatus.state === "working" ? "Saving…" : "Save password"}
            </button>
          </form>
        </section>

        <section className="profile-card" aria-labelledby="profile-palette-title">
          <h2 id="profile-palette-title">Latest colours</h2>
          {recentColours.length ? (
            <ul className="profile-palette">
              {recentColours.map((mix) => (
                <li key={mix.id}>
                  <button className="profile-swatch" onClick={() => onViewMix(mix)} title={`${mix.name} · ${mix.color.toUpperCase()}`} aria-label={`View ${mix.name}`}>
                    <span style={{ backgroundColor: mix.color }} />
                    <small>{mix.name}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="profile-help">Your newest mixes will show here once you save some.</p>
          )}
        </section>

        <section className="profile-card" aria-labelledby="profile-actions-title">
          <h2 id="profile-actions-title">Your data</h2>
          <p className="profile-help">Download everything in your account, photos included, as a backup file you can import anywhere.</p>
          <div className="profile-actions">
            <button className="sort-button" onClick={onExport} disabled={!mixes.length && !collections.length}><Download size={15} /> Export backup</button>
            <button className="sort-button sign-out-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
          </div>
        </section>
      </div>
    </div>
  );
}
