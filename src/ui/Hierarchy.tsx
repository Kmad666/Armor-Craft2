import { useMemo, useState } from 'react';
import { HIERARCHY_GROUPS, REGION_BY_ID } from '../body/body';
import type { ComponentInstance } from '../core/types';
import { useEditor } from '../state/store';
import { focusOn } from '../scene/bridge';
import { Icon } from './Icon';

function Row({ id, depth }: { id: string; depth: number }) {
  const inst = useEditor((s) => s.design.instances[id]);
  const selected = useEditor((s) => s.selectedId === id);
  const hovered = useEditor((s) => s.hoveredId === id);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!inst) return null;
  const s = useEditor.getState;
  const commit = () => {
    if (draft.trim() && draft !== inst.name) s().rename(id, draft);
    setEditing(false);
  };
  return (
    <>
      <div
        className={`tree-row${selected ? ' selected' : ''}${hovered ? ' hovered' : ''}${inst.visible ? '' : ' dim'}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        data-testid={`tree-${id}`}
        onClick={() => s().select(id)}
        onDoubleClick={() => {
          setDraft(inst.name);
          setEditing(true);
        }}
        onMouseEnter={() => s().hover(id)}
        onMouseLeave={() => s().hover(null)}
      >
        <button
          className={`caret${inst.children.length ? '' : ' hidden'}`}
          title={open ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        </button>
        <span className={`layer-chip l${inst.layer}`} title={`Layer ${inst.layer}`}>
          {inst.parentId ? '◆' : inst.layer}
        </span>
        {editing ? (
          <input
            className="rename"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className="tree-name" title={`${inst.name} — double-click to rename`}>
            {inst.name}
          </span>
        )}
        {inst.symmetry.partnerId && (
          <span className="link-mark" title="Linked to its mirrored twin">
            <Icon name="link" size={11} />
          </span>
        )}
        <span className="row-actions">
          <button
            title="Move up a layer"
            onClick={(e) => {
              e.stopPropagation();
              s().moveLayer(id, 1);
            }}
          >
            <Icon name="up" size={12} />
          </button>
          <button
            title="Move down a layer"
            onClick={(e) => {
              e.stopPropagation();
              s().moveLayer(id, -1);
            }}
          >
            <Icon name="down" size={12} />
          </button>
          <button
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              s().duplicate(id);
            }}
          >
            <Icon name="duplicate" size={12} />
          </button>
          <button
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(id);
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        </span>
        <button
          className={`row-toggle${inst.locked ? ' on' : ''}`}
          title={inst.locked ? 'Unlock' : 'Lock against editing'}
          onClick={(e) => {
            e.stopPropagation();
            s().setLocked(id, !inst.locked);
          }}
        >
          <Icon name={inst.locked ? 'lock' : 'unlock'} size={13} />
        </button>
        <button
          className={`row-toggle${inst.visible ? '' : ' on'}`}
          title={inst.visible ? 'Hide' : 'Show'}
          data-testid={`vis-${id}`}
          onClick={(e) => {
            e.stopPropagation();
            s().setVisible(id, !inst.visible);
          }}
        >
          <Icon name={inst.visible ? 'eye' : 'eyeOff'} size={13} />
        </button>
      </div>
      {open && inst.children.map((c) => <Row key={c} id={c} depth={depth + 1} />)}
    </>
  );
}

/** Delete with a confirmation when the component carries attached accessories. */
export function requestDelete(id: string) {
  const s = useEditor.getState();
  const inst = s.design.instances[id];
  if (!inst) return;
  if (inst.children.length) {
    s.ask({
      title: `Delete "${inst.name}"?`,
      body: `Its ${inst.children.length} attached accessor${inst.children.length === 1 ? 'y' : 'ies'} will be deleted with it. You can undo this.`,
      action: 'Delete',
      onYes: () => useEditor.getState().remove(id),
    });
  } else s.remove(id);
}

export function Hierarchy() {
  const roots = useEditor((s) => s.design.roots);
  const instances = useEditor((s) => s.design.instances);
  const groups = useMemo(() => {
    const by: Record<string, ComponentInstance[]> = {};
    for (const id of roots) {
      const inst = instances[id];
      if (!inst) continue;
      const g = REGION_BY_ID[inst.region]?.group ?? 'Other';
      (by[g] ??= []).push(inst);
    }
    for (const g of Object.values(by)) g.sort((a, b) => a.layer - b.layer || a.order - b.order);
    return by;
    // layer / order changes must re-sort, so depend on the instances map
  }, [roots, instances]);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const used = HIERARCHY_GROUPS.filter((g) => groups[g]?.length);
  return (
    <div className="hierarchy" data-testid="hierarchy">
      <div className="panel-title">
        <Icon name="layers" size={14} /> Scene
      </div>
      <div className="tree">
        <div className="tree-row root" onClick={() => useEditor.getState().select(null)} onDoubleClick={() => focusOn(null)}>
          <span className="tree-name">Mannequin</span>
          <span className="count">{roots.length}</span>
        </div>
        {!used.length && (
          <div className="empty">
            <strong>Nothing equipped yet.</strong>
            <span>Pick a part from the catalogue on the right, or click a body part on the mannequin to see what fits there.</span>
          </div>
        )}
        {used.map((g) => (
          <div key={g}>
            <div className="tree-row group" onClick={() => setClosed({ ...closed, [g]: !closed[g] })}>
              <button className="caret">
                <Icon name={closed[g] ? 'chevronRight' : 'chevronDown'} size={12} />
              </button>
              <span className="tree-name">{g}</span>
              <span className="count">{groups[g].length}</span>
            </div>
            {!closed[g] && groups[g].map((i) => <Row key={i.id} id={i.id} depth={1} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
