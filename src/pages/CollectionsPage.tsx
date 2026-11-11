import { Folder, LoaderCircle, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import type { Collection, Mix } from "../types";
import { PageBanners, PageHeading } from "../components/PageHeading";
import { plural } from "../lib/validation";

interface CollectionsPageProps {
  collections: Collection[];
  mixes: Mix[];
  loading: boolean;
  errors: string[];
  notice: string;
  onNewCollection: () => void;
}

/** Every collection as a card; each opens its own page with the mixes in it. */
export function CollectionsPage({ collections, mixes, loading, errors, notice, onNewCollection }: CollectionsPageProps) {
  const mixesById = useMemo(() => new Map(mixes.map((mix) => [mix.id, mix])), [mixes]);

  return (
    <>
      <PageHeading
        eyebrow="MIXES THAT BELONG TOGETHER"
        title="Collections"
        subtitle="Group mixes for an army, a scheme or a commission. A mix can be in as many collections as you like."
        action={<button className="primary-button" onClick={onNewCollection} disabled={loading}><Plus size={18} strokeWidth={2.4} /> New collection</button>}
      />

      <section className="collection-section">
        <div className="section-title-row">
          <div>
            <h2>Your collections <span className="mix-total">{collections.length}</span></h2>
            <p>Open one to see, share or change its mixes.</p>
          </div>
        </div>

        <PageBanners errors={errors} notice={notice} />

        {loading ? (
          <div className="archive-loading" role="status"><LoaderCircle size={22} className="spin" /><span>Loading your collections…</span></div>
        ) : collections.length > 0 ? (
          <div className="project-grid">
            {collections.map((collection) => {
              const inside = collection.mixIds.flatMap((id) => mixesById.get(id) ?? []);
              return (
                <Link className="project-card collection-card" to={`/collections/${collection.id}`} key={collection.id}>
                  <span className="project-cover">
                    {inside.length ? (
                      <span className="project-colors" aria-hidden="true">
                        {inside.slice(0, 8).map((mix) => <i key={mix.id} style={{ backgroundColor: mix.color }} />)}
                      </span>
                    ) : <Folder size={26} />}
                  </span>
                  <span className="project-card-body">
                    <strong>{collection.name}</strong>
                    <small>{plural(inside.length, "mix", "mixes")}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-search page-empty">
            <Folder size={23} />
            <h3>Start your first collection</h3>
            <p>Put the mixes for one army, scheme or commission together, then share them as one link.</p>
            <button className="primary-button" onClick={onNewCollection}><Plus size={16} /> New collection</button>
          </div>
        )}
      </section>
    </>
  );
}
