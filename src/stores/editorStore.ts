import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Tab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty: boolean;
  encoding: string;
  lineEnding: string;
  cursorLine: number;
  cursorCol: number;
  scrollTop: number;
  undoStack: string[];
  redoStack: string[];
  lastSavedAt: number | null;
}

interface EditorState {
  tabs: Tab[];
  activeTabId: string;
  sessionSaveTimer: ReturnType<typeof setTimeout> | null;
  /** Most-recently-closed first, capped. Drives Cmd+Shift+T. */
  closedTabs: Tab[];

  // Actions
  addTab: (tab?: Partial<Tab>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  updateCursor: (id: string, line: number, col: number) => void;
  updateScrollTop: (id: string, scrollTop: number) => void;
  setFilePath: (id: string, path: string, title: string) => void;
  setClean: (id: string) => void;
  markSaved: (id: string, savedContent: string) => void;
  setEncoding: (id: string, encoding: string) => void;
  setLineEnding: (id: string, lineEnding: string) => void;
  getActiveTab: () => Tab | undefined;
  saveSession: () => void;
  loadSession: () => Promise<void>;
  reopenClosedTab: () => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  openFileInTab: (file: {
    title: string;
    filePath: string;
    content: string;
    encoding: string;
    lineEnding: string;
  }) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  pushUndo: (id: string, content: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Windows Notepad numbering: the first scratch tab is "Untitled", the next
 * free slot after that is "Untitled 2", "Untitled 3", ... Numbers are reused
 * once a tab closes, so you never drift up to "Untitled 47".
 */
function nextUntitledTitle(existing: Tab[]): string {
  const taken = new Set<number>();
  for (const tab of existing) {
    if (tab.title === 'Untitled') {
      taken.add(1);
      continue;
    }
    const match = /^Untitled (\d+)$/.exec(tab.title);
    if (match) taken.add(parseInt(match[1], 10));
  }
  let n = 1;
  while (taken.has(n)) n += 1;
  return n === 1 ? 'Untitled' : `Untitled ${n}`;
}

/**
 * Sessions saved before tab numbering existed hold several tabs all called
 * "Untitled". Hand the duplicates the next free slot on load so a restored
 * window doesn't come back with eight identical tabs.
 */
function renumberUntitled(tabs: Tab[]): Tab[] {
  const claimed = new Set<number>();
  const numberOf = (title: string): number | null => {
    if (title === 'Untitled') return 1;
    const match = /^Untitled (\d+)$/.exec(title);
    return match ? parseInt(match[1], 10) : null;
  };

  // First pass: every untitled tab keeps its number if nothing else took it.
  const claims = tabs.map((tab) => {
    if (tab.filePath) return null;
    const n = numberOf(tab.title);
    if (n === null || claimed.has(n)) return null;
    claimed.add(n);
    return n;
  });

  // Second pass: the leftovers fill the gaps.
  return tabs.map((tab, i) => {
    if (tab.filePath || claims[i] !== null) return tab;
    if (numberOf(tab.title) === null) return tab;
    let n = 1;
    while (claimed.has(n)) n += 1;
    claimed.add(n);
    return { ...tab, title: n === 1 ? 'Untitled' : `Untitled ${n}` };
  });
}

function createDefaultTab(overrides?: Partial<Tab>, existing: Tab[] = []): Tab {
  return {
    id: generateId(),
    title: nextUntitledTitle(existing),
    filePath: null,
    content: '',
    isDirty: false,
    encoding: 'UTF-8',
    lineEnding: 'LF',
    cursorLine: 1,
    cursorCol: 1,
    scrollTop: 0,
    undoStack: [],
    redoStack: [],
    lastSavedAt: null,
    ...overrides,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [createDefaultTab()],
  activeTabId: '',
  sessionSaveTimer: null,
  closedTabs: [],

  addTab: (overrides) => {
    const newTab = createDefaultTab(overrides, get().tabs);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    get().saveSession();
  },

  closeTab: (id) => {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const closed = state.tabs[idx];
    const newTabs = state.tabs.filter((t) => t.id !== id);

    // Worth reopening only if there was something in it. An untouched scratch
    // tab would just be noise in the history.
    if (closed.filePath || closed.content.length > 0) {
      set({ closedTabs: [closed, ...state.closedTabs].slice(0, 10) });
    }

    if (newTabs.length === 0) {
      // Always keep at least one tab
      const fresh = createDefaultTab();
      set({ tabs: [fresh], activeTabId: fresh.id });
    } else {
      let newActive = state.activeTabId;
      if (state.activeTabId === id) {
        // Switch to nearest tab
        const newIdx = Math.min(idx, newTabs.length - 1);
        newActive = newTabs[newIdx].id;
      }
      set({ tabs: newTabs, activeTabId: newActive });
    }
    get().saveSession();
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
    get().saveSession();
  },

  updateContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, isDirty: true } : t
      ),
    }));
    get().saveSession();
  },

  pushUndo: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              undoStack: [...t.undoStack.slice(-50), content],
              redoStack: [],
            }
          : t
      ),
    }));
  },

  reopenClosedTab: () => {
    const [restored, ...rest] = get().closedTabs;
    if (!restored) return;
    // A fresh id, so reopening the same tab twice doesn't collide.
    const tab: Tab = { ...restored, id: generateId(), undoStack: [], redoStack: [] };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      closedTabs: rest,
    }));
    get().saveSession();
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const { length } = state.tabs;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || fromIndex >= length ||
        toIndex < 0 || toIndex >= length
      ) {
        return state;
      }
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    });
    get().saveSession();
  },

  /** Opening a file already on screen focuses it instead of duplicating it. */
  openFileInTab: (file) => {
    const existing = get().tabs.find((t) => t.filePath === file.filePath);
    if (existing) {
      set({ activeTabId: existing.id });
      get().saveSession();
      return;
    }
    get().addTab({
      title: file.title,
      filePath: file.filePath,
      content: file.content,
      encoding: file.encoding,
      lineEnding: file.lineEnding,
      isDirty: false,
    });
  },

  undo: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.undoStack.length === 0) return;
    const prev = tab.undoStack[tab.undoStack.length - 1];
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              redoStack: [...t.redoStack, t.content],
              undoStack: t.undoStack.slice(0, -1),
              content: prev,
              isDirty: true,
            }
          : t
      ),
    }));
  },

  redo: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.redoStack.length === 0) return;
    const next = tab.redoStack[tab.redoStack.length - 1];
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              undoStack: [...t.undoStack, t.content],
              redoStack: t.redoStack.slice(0, -1),
              content: next,
              isDirty: true,
            }
          : t
      ),
    }));
  },

  updateCursor: (id, line, col) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, cursorLine: line, cursorCol: col } : t
      ),
    }));
  },

  updateScrollTop: (id, scrollTop) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, scrollTop } : t
      ),
    }));
  },

  setFilePath: (id, path, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, filePath: path, title } : t
      ),
    }));
    get().saveSession();
  },

  setClean: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, isDirty: false, lastSavedAt: Date.now() } : t
      ),
    }));
    get().saveSession();
  },

  /**
   * Clear the dirty flag only if the buffer still matches what we wrote.
   * Keystrokes that landed mid-write keep the tab dirty for the next pass.
   */
  markSaved: (id, savedContent) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? { ...t, isDirty: t.content !== savedContent, lastSavedAt: Date.now() }
          : t
      ),
    }));
    get().saveSession();
  },

  setEncoding: (id, encoding) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, encoding } : t
      ),
    }));
    get().saveSession();
  },

  setLineEnding: (id, lineEnding) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, lineEnding } : t
      ),
    }));
    get().saveSession();
  },

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },

  saveSession: () => {
    const state = get();
    if (state.sessionSaveTimer) {
      clearTimeout(state.sessionSaveTimer);
    }
    const timer = setTimeout(async () => {
      const current = get();
      try {
        await invoke('save_session', {
          session: {
            tabs: current.tabs.map((t) => ({
              id: t.id,
              title: t.title,
              file_path: t.filePath,
              content: t.content,
              is_dirty: t.isDirty,
              encoding: t.encoding,
              line_ending: t.lineEnding,
              cursor_line: t.cursorLine,
              cursor_col: t.cursorCol,
              scroll_top: t.scrollTop,
            })),
            active_tab_id: current.activeTabId,
          },
        });
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    }, 500);
    set({ sessionSaveTimer: timer });
  },

  loadSession: async () => {
    try {
      const session = await invoke<{
        tabs: Array<{
          id: string;
          title: string;
          file_path: string | null;
          content: string;
          is_dirty: boolean;
          encoding: string;
          line_ending: string;
          cursor_line: number;
          cursor_col: number;
          scroll_top: number;
        }>;
        active_tab_id: string;
      } | null>('load_session');

      if (session && session.tabs.length > 0) {
        set({
          tabs: renumberUntitled(session.tabs.map((t) => ({
            id: t.id,
            title: t.title,
            filePath: t.file_path,
            content: t.content,
            isDirty: t.is_dirty,
            encoding: t.encoding,
            lineEnding: t.line_ending,
            cursorLine: t.cursor_line,
            cursorCol: t.cursor_col,
            scrollTop: t.scroll_top,
            undoStack: [],
            redoStack: [],
            lastSavedAt: null,
          }))),
          activeTabId: session.active_tab_id,
        });
      } else {
        // Initialize with first tab's id
        const state = get();
        if (state.tabs.length > 0 && !state.activeTabId) {
          set({ activeTabId: state.tabs[0].id });
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      const state = get();
      if (state.tabs.length > 0) {
        set({ activeTabId: state.tabs[0].id });
      }
    }
  },
}));
