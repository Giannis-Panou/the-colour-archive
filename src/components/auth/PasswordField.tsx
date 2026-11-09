import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  /** Guidance read by screen readers as the field's description, not as part of its name. */
  hint?: string;
}

export function PasswordField({ id, label, value, onChange, autoComplete, autoFocus = false, hint = "" }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field-label sign-in-field">
      <label className="field-label-text" htmlFor={id}>{label}</label>
      <span className="password-input">
        <input
          id={id}
          className="text-input"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}
