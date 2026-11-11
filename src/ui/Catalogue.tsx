import { useEffect, useMemo, useState } from 'react';
import { MATERIAL_PRESETS } from '../catalog/materials';
import { CATEGORIES, ERAS, TEMPLATES, type TemplateDef } from '../catalog/templates';
import type { CustomPart } from '../core/types';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import { useEditor } from '../state/store';
import { Icon } from './Icon';
import { requestCustomThumb, requestTemplateThumb, useThumbs } from './thumbnails';

const TABS = [...CATEGORIES.map((c) => ({ id: c.id as string, label: c.label })), { id: 'materials', label: 'Materials' }, { id: 'custom', label: 'Custom' }];

/** Add a catalogue entry: fitted parts go straight onto the body, accessories enter placement mode. */
export function useCatalogueAdd() {
  return (t: TemplateDef, auto = false) => {
    const s = useEditor.getState();
    if (t.kind === 'fitted') {
      s.setPlacing(null);
      s.addFitted(t.id);
      return;
    }
    if (!s.design.roots.length) {
      s.notify('Accessories attach to armour. Add a helmet or another piece first.', 'info');
      return;
    }
    const sel = s.selectedId ? s.design.instances[s.selectedId] : null;
    if (auto && sel && !sel.locked) {
      s.setPlacing(null);
      s.autoAttach(t.id, sel.id);
      return;
    }
    s.setPlacing({ kind: 'template', templateId: t.id });
  };
}

function Card({ t }: { t: TemplateDef }) {
  const url = useThumbs((s) => s.urls[t.id]);
  const hasSelection = useEditor((s) => !!s.selectedId);
  const placing = useEditor((s) => s.placing?.kind === 'template' && s.placing.templateId === t.id);
  const add = useCatalogueAdd();
  useEffect(() => requestTemplateThumb(t.id), [t.id]);
  return (
    <div
      className={`card${placing ? ' active' : ''}`}
      draggable
      data-testid={`card-${t.id}`}
      title={`${t.desc}\n${t.kind === 'accessory' ? 'Click, then click a surface to attach (or drag it onto the armour).' : 'Click to equip, or drag onto the mannequin.'}`}
      onClick={() => add(t)}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-atelier', JSON.stringify({ templateId: t.id }));
        e.dataTransfer.effectAllowed = 'copy';
        if (t.kind === 'accessory') useEditor.getState().setPlacing({ kind: 'template', templateId: t.id });
      }}
      onDragEnd={() => {
        const s = useEditor.getState();
        if (s.placing?.kind === 'template' && s.placing.templateId === t.id) s.setPlacing(null);
      }}
    >
      <div className="thumb">{url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-wait" />}</div>
      <div className="card-name">{t.name}</div>
      {t.kind === 'accessory' && hasSelection && (
        <button
          className="quick"
          title="Attach to the selected component at its default mount"
          data-testid={`quick-${t.id}`}
          onClick={(e) => {
            e.stopPropagation();
            add(t, true);
          }}
        >
          <Icon name="plus" size={12} />
        </button>
      )}
    </div>
  );
}

function CustomCard({ part }: { part: CustomPart }) {
  const url = useThumbs((s) => s.urls[`custom:${part.id}`]);
  useEffect(() => requestCustomThumb(part), [part]);
  const t = TEMPLATE_BY_ID[part.rootTemplateId];
  const place = () => {
    const s = useEditor.getState();
    if (t?.kind === 'accessory') {
      if (!s.design.roots.length) return s.notify('This custom part is an accessory - add an armour piece to attach it to first.', 'info');
      s.setPlacing({ kind: 'custom', partId: part.id });
    } else s.placeCustomPart(part.id);
  };
  return (
    <div className="card" data-testid={`custom-${part.id}`} title={`${part.name} — based on ${t?.name ?? 'a removed component'}`} onClick={place}>
      <div className="thumb">{url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-wait" />}</div>
      <div className="card-name">{part.name}</div>
      <button
        className="quick danger"
        title="Remove from the custom library"
        onClick={(e) => {
          e.stopPropagation();
          useEditor.getState().ask({ title: `Remove "${part.name}"?`, body: 'It will be removed from your custom library. Designs that already use it are not affected.', action: 'Remove', onYes: () => useEditor.getState().deleteCustomPart(part.id) });
        }}
      >
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function MaterialsTab() {
  const inst = useEditor((s) => (s.selectedId ? s.design.instances[s.selectedId] : null));
  const slot = useEditor((s) => s.materialSlot);
  const groups = ['Metals', 'Fabrics', 'Mail & Leather'] as const;
  return (
    <div className="cat-scroll">
      <div className="cat-hint">
        {inst ? (
          <>
            Applies to <strong>{inst.name}</strong> — <em>{inst.materials[slot] ? slot : 'base'}</em> region. Switch regions in the Inspector's Material tab.
          </>
        ) : (
          'Select a component, then click a material to apply it.'
        )}
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="sub-title">{g}</div>
          <div className="mat-grid">
            {MATERIAL_PRESETS.filter((p) => p.group === g).map((p) => (
              <button
                key={p.preset}
                className="mat-card"
                data-testid={`catmat-${p.preset}`}
                onClick={() => {
                  const s = useEditor.getState();
                  if (!inst) return s.notify('Select a component first, then pick a material.', 'info');
                  const { name: _n, group: _g, ...spec } = p;
                  s.setMaterial(inst.id, inst.materials[slot] ? slot : 'base', spec);
                }}
              >
                <i className={p.kind} style={{ background: p.kind === 'metal' || p.kind === 'mail' ? `linear-gradient(135deg, ${p.color}, #ffffff66 45%, ${p.color} 72%)` : p.color }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Catalogue() {
  const tab = useEditor((s) => s.catalogCategory);
  const era = useEditor((s) => s.catalogEra);
  const custom = useEditor((s) => s.customParts);
  const [query, setQuery] = useState('');
  const setCatalog = useEditor.getState().setCatalog;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (q) return `${t.name} ${t.sub} ${t.desc} ${t.eras.join(' ')}`.toLowerCase().includes(q);
      if (t.category !== tab) return false;
      // accessories are never locked to an era
      if (era !== 'all' && t.category !== 'accessories' && t.kind !== 'accessory' && !t.eras.includes(era as any)) return false;
      return true;
    });
  }, [tab, era, query]);

  const bySub = useMemo(() => {
    const m = new Map<string, TemplateDef[]>();
    for (const t of list) {
      const k = query.trim() ? `${CATEGORIES.find((c) => c.id === t.category)?.label} · ${t.sub}` : t.sub;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()];
  }, [list, query]);

  return (
    <div className="catalogue" data-testid="catalogue">
      <div className="panel-title">
        <Icon name="grid" size={14} /> Catalogue
        <span className="count">{TEMPLATES.length} parts</span>
      </div>
      <div className="cat-search">
        <input placeholder="Search parts…" value={query} data-testid="cat-search" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {query && (
          <button title="Clear search" onClick={() => setQuery('')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="cat-tabs">
        {TABS.map((c) => (
          <button key={c.id} className={!query && tab === c.id ? 'on' : ''} data-testid={`cat-${c.id}`} onClick={() => { setQuery(''); setCatalog(c.id); }}>
            {c.label}
          </button>
        ))}
      </div>
      {!query && tab !== 'materials' && tab !== 'custom' && (
        <div className="era">
          <select value={era} data-testid="era-filter" onChange={(e) => setCatalog(tab, e.target.value)} title="Filter by historical inspiration">
            <option value="all">All styles</option>
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {!query && tab === 'materials' ? (
        <MaterialsTab />
      ) : !query && tab === 'custom' ? (
        <div className="cat-scroll">
          {!custom.length && (
            <div className="empty">
              <strong>No custom parts yet.</strong>
              <span>Reshape a component, attach decorations to it, then use “Save as custom part” in the Inspector. It will appear here ready to reuse.</span>
            </div>
          )}
          <div className="card-grid">
            {custom.map((p) => (
              <CustomCard key={p.id} part={p} />
            ))}
          </div>
        </div>
      ) : (
        <div className="cat-scroll">
          {!list.length && (
            <div className="empty">
              <strong>No parts match.</strong>
              <span>Try a different search or switch the style filter back to “All styles”.</span>
            </div>
          )}
          {bySub.map(([sub, items]) => (
            <div key={sub}>
              <div className="sub-title">{sub}</div>
              <div className="card-grid">
                {items.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
