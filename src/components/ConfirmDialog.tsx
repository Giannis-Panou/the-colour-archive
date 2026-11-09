import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  id: string;
  icon: ReactNode;
  /** "import-icon" for a green icon; the default is the red delete style. */
  iconClassName?: string;
  title: string;
  description: ReactNode;
  /** Shown under the description, e.g. a warning or an error. */
  children?: ReactNode;
  /** The buttons. */
  actions: ReactNode;
  actionsClassName?: string;
  className?: string;
  closeOnBackdrop?: boolean;
  onClose: () => void;
}

/** The small centred dialogs: delete a collection, import a backup, move mixes to an account. */
export function ConfirmDialog({ id, icon, iconClassName = "", title, description, children, actions, actionsClassName = "", className = "", closeOnBackdrop, onClose }: ConfirmDialogProps) {
  return (
    <Modal
      onClose={onClose}
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      className={`collection-delete-dialog ${className}`.trim()}
      backdropClassName="collection-delete-backdrop"
      closeOnBackdrop={closeOnBackdrop}
    >
      <span className={`confirm-icon ${iconClassName}`.trim()}>{icon}</span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      {children}
      <div className={`confirm-actions ${actionsClassName}`.trim()}>{actions}</div>
    </Modal>
  );
}
