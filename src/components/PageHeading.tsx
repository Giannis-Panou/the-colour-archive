import { Check } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeadingProps {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  /** The page's main button. */
  action?: ReactNode;
}

/** The big heading every page starts with. */
export function PageHeading({ eyebrow, title, subtitle, action }: PageHeadingProps) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div>
        <h1>{title}<span className="heading-period">.</span></h1>
        <p className="heading-subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Errors and the latest success message, shown above a page's content. */
export function PageBanners({ errors, notice }: { errors: string[]; notice: string }) {
  return (
    <>
      {errors.filter(Boolean).map((message) => <div className="error-banner" role="alert" key={message}>{message}</div>)}
      {notice && <div className="success-banner" role="status"><Check size={16} />{notice}</div>}
    </>
  );
}
