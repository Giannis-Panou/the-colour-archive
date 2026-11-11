import { BookOpen, Folder, Hammer, Layers3, Palette, PaintBucket } from "lucide-react";
import { Link, NavLink } from "react-router";

interface SidebarProps {
  /** Shown on My paints: how many things are on the shopping list. */
  shoppingCount: number;
}

const WORKSHOP = [
  { to: "/", label: "Mixes", icon: Palette, end: true },
  { to: "/collections", label: "Collections", icon: Folder, end: false },
  { to: "/recipes", label: "Recipes", icon: BookOpen, end: false },
  { to: "/projects", label: "Projects", icon: Hammer, end: false },
  { to: "/paints", label: "My paints", icon: PaintBucket, end: false },
];

/** The app's sections: a sidebar on desktops, an icon rail on tablets, bottom tabs on phones. */
export function Sidebar({ shoppingCount }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Link className="brand" to="/" aria-label="The Colour Archive: go to My archive" title="Go to My archive">
        <span className="brand-mark" aria-hidden="true"><Layers3 size={21} strokeWidth={2.2} /></span>
        <span className="brand-name">the colour<br />archive</span>
      </Link>

      <nav className="workshop-nav" aria-label="Workshop">
        <div className="sidebar-section-label">WORKSHOP</div>
        {WORKSHOP.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) => `nav-item workshop-item ${isActive ? "active" : ""}`}
          >
            <Icon size={17} />
            <span className="workshop-label">{label}</span>
            {to === "/paints" && shoppingCount > 0 && (
              <span className="nav-count shopping-count" title={`${shoppingCount} on your shopping list`}>
                {shoppingCount}<span className="sr-only"> on your shopping list</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
