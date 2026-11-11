import { useEffect } from 'react';
import { focusOn, setView } from './scene/bridge';
import { cancelActiveDrag } from './scene/interaction';
import { Viewport } from './scene/Viewport';
import { storage, useEditor } from './state/store';
import { Catalogue } from './ui/Catalogue';
import { ConfirmDialog, DesignsDialog, HelpDialog, StatusBar, Toasts, Toolbar, TopBar, Tutorial, ViewButtons, tutorialShouldStart } from './ui/Chrome';
import { Hierarchy, requestDelete } from './ui/Hierarchy';
import { Icon } from './ui/Icon';
import { Inspector } from './ui/Inspector';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.saveDesign();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (s.selectedId) s.duplicate(s.selectedId);
        return;
      }
      if (mod || e.altKey) return;
      switch (e.key) {
        case 'Escape':
          if (s.confirm) s.ask(null);
          else if (s.dialog) s.setDialog(null);
          else if (s.placing) s.setPlacing(null);
          else if (s.dragging) cancelActiveDrag();
          else s.select(null);
          break;
        case 'Enter':
          if (s.placing?.kind === 'template' && s.selectedId) {
            s.autoAttach(s.placing.templateId, s.selectedId);
            s.setPlacing(null);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (s.selectedId) requestDelete(s.selectedId);
          break;
        case 'q':
        case 'Q':
          s.setTool('select');
          break;
        case 'w':
        case 'W':
          s.setTool('move');
          break;
        case 'e':
        case 'E':
          s.setTool('rotate');
          break;
        case 'r':
        case 'R':
          s.setTool('scale');
          break;
        case 't':
        case 'T':
          s.setTool('morph');
          break;
        case 'm':
        case 'M':
          if (s.selectedId) s.mirror(s.selectedId);
          break;
        case 'f':
        case 'F':
          focusOn(s.selectedId);
          break;
        case 'h':
        case 'H':
          if (s.selectedId) s.setVisible(s.selectedId, !s.design.instances[s.selectedId].visible);
          break;
        case 'Home':
          setView('quarter');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Autosave a recovery draft shortly after every change, and restore it on startup. */
function useDraftRecovery() {
  useEffect(() => {
    const draft = storage.loadDraft();
    if (draft && draft.design.roots.length) useEditor.getState().replaceDesign(draft.design, `Recovered your last session (“${draft.design.name}”).`);
    else if (tutorialShouldStart()) useEditor.getState().setTutorial(0);
    let timer: number | null = null;
    let last = useEditor.getState().design;
    const unsub = useEditor.subscribe((s) => {
      if (s.design === last || s.editBase) return;
      last = s.design;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => storage.saveDraft(useEditor.getState().design), 500);
    });
    const flush = () => storage.saveDraft(useEditor.getState().design);
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', flush);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
}

export function App() {
  useShortcuts();
  useDraftRecovery();
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const toggle = useEditor.getState().togglePanel;
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <aside className={`panel left${leftOpen ? '' : ' collapsed'}`}>
          {leftOpen && (
            <>
              <Hierarchy />
              <Inspector />
            </>
          )}
          <button className="collapse" data-testid="toggle-left" title={leftOpen ? 'Collapse panel' : 'Show scene and inspector'} onClick={() => toggle('left')}>
            <Icon name={leftOpen ? 'chevronLeft' : 'chevronRight'} size={14} />
          </button>
        </aside>
        <main className="center">
          <Viewport />
          <Toolbar />
          <ViewButtons />
          <StatusBar />
          <Tutorial />
          <Toasts />
        </main>
        <aside className={`panel right${rightOpen ? '' : ' collapsed'}`}>
          <button className="collapse" data-testid="toggle-right" title={rightOpen ? 'Collapse catalogue' : 'Show catalogue'} onClick={() => toggle('right')}>
            <Icon name={rightOpen ? 'chevronRight' : 'chevronLeft'} size={14} />
          </button>
          {rightOpen && <Catalogue />}
        </aside>
      </div>
      <DesignsDialog />
      <HelpDialog />
      <ConfirmDialog />
    </div>
  );
}
