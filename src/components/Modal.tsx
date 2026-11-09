import { useEffect, useRef, useState, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Dialogs can stack (e.g. sign in from inside the share dialog). Only the top one reacts to Escape and Tab.
const openStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = "";

interface ModalProps {
  /** Called on Escape and on a click outside the dialog. */
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  /** Classes for the dialog box, e.g. "mix-modal" or "collection-delete-dialog". */
  className: string;
  /** Extra classes for the dimmed backdrop. */
  backdropClassName?: string;
  /** False keeps the dialog open on outside clicks (for choices that must be answered). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

/**
 * Accessible dialog: focus moves into it and stays there while it is open, Escape and outside
 * clicks close it, the page behind doesn't scroll, and focus returns to what opened it.
 */
export function Modal({ onClose, labelledBy, describedBy, className, backdropClassName = "", closeOnBackdrop = true, children }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // Remember what had focus before the dialog rendered: autoFocus inside it moves focus
  // during commit, before any effect could look.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const id = Symbol("modal");
    openStack.push(id);
    const dialog = dialogRef.current;

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    // Respect autoFocus inside the dialog; otherwise focus the dialog itself.
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id || !dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openStack.splice(openStack.indexOf(id), 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      // Only when the dialog has really gone: React's development double-run of effects keeps it
      // in the page, and moving focus then would pull it out of the open dialog.
      if (!dialog?.isConnected && opener?.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
