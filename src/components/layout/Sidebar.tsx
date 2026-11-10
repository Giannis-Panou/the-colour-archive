import { BookOpen, ChevronDown, Folder, FolderPlus, Hammer, Layers3, Palette, PaintBucket, Trash2 } from "lucide-react";
import { Link, NavLink } from "react-router";
import type { Collection, Mix } from "../../types";

interface SidebarProps {
  collections: Collection[];
  mixes: Mix[];
  selectedCollectionId: string | null;
  /** Shown on My paints: how many things are on the shopping list. */
  shoppingCount: number;
  /** On narrow screens the collections list is a drawer. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Called after any navigation, so the drawer can close on narrow screens. */
  onNavigate: () => void;
  onAddCollection: () => void;
  onDeleteCollection: (collection: Collection) => void;
}

const WORKSHOP = [
  { to: "/", label: "Mixes", icon: Palette, end: true },
  { to: "/recipes", label: "Recipes", icon: BookOpen, end: false },
  { to: "/projects", label: "Projects", icon: Hammer, end: false },
  { to: "/paints", label: "My paints", icon: PaintBucket, end: false },
];

export function Sidebar({ collections, mixes, selectedCollectionId, shoppingCount, expanded, onToggleExpanded, onNavigate, onAddCollection, onDeleteCollection }: SidebarProps) {
  const mixIds = new Set(mixes.map((mix) => mix.id));

  return (
    <aside className={`sidebar ${expanded ? "collections-open" : ""}`}>
      <Link className="brand" to="/" onClick={onNavigate} aria-label="The Colour Archive: go to My archive" title="Go to My archive">
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
            onClick={onNavigate}
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

      <div className="collections-section">
        <div className="collections-desktop-label">COLLECTIONS</div>
        <button className="collections-toggle" aria-label="Toggle collections" aria-expanded={expanded} title="Toggle collections" onClick={onToggleExpanded}>
          <FolderPlus size={17} className="collections-toggle-icon" />
          <span className="collections-label-desktop">COLLECTIONS</span>
          <span className="collections-label-mobile">Collections</span>
          <ChevronDown size={15} className={expanded ? "collections-chevron expanded" : "collections-chevron"} />
        </button>
        <nav className="side-nav" aria-label="Collections">
          {collections.map((collection) => {
            const active = selectedCollectionId === collection.id;
            return (
              <div className={`collection-nav-row ${active ? "active" : ""}`} key={collection.id}>
                <Link
                  className={`nav-item collection-nav-item ${active ? "active" : ""}`}
                  to={`/collections/${collection.id}`}
                  onClick={onNavigate}
                  title={collection.name}
                  aria-current={active ? "page" : undefined}
                >
                  <Folder size={17} />
                  <span>{collection.name}</span>
                  <span className="nav-count">{collection.mixIds.filter((id) => mixIds.has(id)).length}</span>
                </Link>
                <button className="collection-delete-button" aria-label={`Delete collection ${collection.name}`} title={`Delete collection ${collection.name}`} onClick={() => onDeleteCollection(collection)}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          <button className="add-collection-nav" onClick={onAddCollection}>
            <FolderPlus size={16} />
            <span>Add collection</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
