import { Download, LogIn, PanelLeftClose, PanelLeftOpen, Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Link } from "react-router";

interface TopbarProps {
  /** Shown after "My archive /" when inside a collection or the profile; null on the archive itself. */
  sectionTitle: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  canExport: boolean;
  onExport: () => void;
  onImportFile: (file: File) => void;
  account: null | { displayName: string; email: string; syncing: boolean; onProfile: boolean };
  /** False when accounts aren't configured, which hides Sign in. */
  accountsEnabled: boolean;
  onSignIn: () => void;
}

export function Topbar({ sectionTitle, sidebarOpen, onToggleSidebar, canExport, onExport, onImportFile, account, accountsEnabled, onSignIn }: TopbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onImportFile(file);
  }

  return (
    <header className="topbar">
      <button
        className="desktop-sidebar-toggle"
        aria-label={sidebarOpen ? "Collapse collections sidebar" : "Expand collections sidebar"}
        title={sidebarOpen ? "Collapse collections sidebar" : "Expand collections sidebar"}
        onClick={onToggleSidebar}
      >
        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>
      <div className="breadcrumb">
        {sectionTitle && (
          <>
            <Link className="breadcrumb-home" to="/">My archive</Link>
            <span className="crumb-slash">/</span>
          </>
        )}
        <strong>{sectionTitle || "My archive"}</strong>
      </div>
      <div className="topbar-right">
        <div className="backup-actions" role="group" aria-label="Backup">
          <button className="backup-button" onClick={onExport} disabled={!canExport} aria-label="Export backup" title="Download a backup file of your archive">
            <Download size={15} /><span>Export</span>
          </button>
          <button className="backup-button" onClick={() => fileInput.current?.click()} aria-label="Import backup" title="Load mixes from a backup file">
            <Upload size={15} /><span>Import</span>
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={chooseFile} />
        </div>
        <span className="topbar-divider" />
        {account ? (
          <>
            <span className={`saved-status ${account.syncing ? "syncing" : "synced"}`} title={`Signed in as ${account.email}`}>
              <span className="status-dot" /> {account.syncing ? "Syncing…" : "Synced to your account"}
            </span>
            <Link
              className={`account-button ${account.onProfile ? "active" : ""}`}
              to="/profile"
              title={`Signed in as ${account.email}. Open your profile`}
              aria-label={`Open profile for ${account.displayName}`}
              aria-current={account.onProfile ? "page" : undefined}
            >
              <span className="account-initial" aria-hidden="true">{account.displayName.charAt(0).toUpperCase()}</span>
              <span className="account-label">{account.displayName}</span>
            </Link>
          </>
        ) : (
          <>
            <span className="saved-status"><span className="status-dot" /> Saved in this browser</span>
            {accountsEnabled && (
              <button className="account-button sign-in" onClick={onSignIn} aria-label="Sign in to sync your archive">
                <LogIn size={15} /><span className="account-label">Sign in</span>
              </button>
            )}
          </>
        )}
        <span className="topbar-divider" />
        <span className="date-label">YOUR PAINT DESK</span>
      </div>
    </header>
  );
}
