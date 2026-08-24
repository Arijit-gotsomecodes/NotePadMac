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
}

interface EditorState {
  tabs: Tab[];
  activeTabId: string;
  sessionSaveTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  addTab: (tab?: Partial<Tab>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  updateCursor: (id: string, line: number, col: number) => void;
  updateScrollTop: (id: string, scrollTop: number) => void;
  setFilePath: (id: string, path: string, title: string) => void;
  setClean: (id: string) => void;
  setEncoding: (id: string, encoding: string) => void;
  setLineEnding: (id: string, lineEnding: string) => void;
  getActiveTab: () => Tab | undefined;
  saveSession: () => void;
  loadSession: () => Promise<void>;
  undo: (id: string) => void;
  redo: (id: string) => void;
  pushUndo: (id: string, content: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function createDefaultTab(overrides?: Partial<Tab>): Tab {
  return {
    id: generateId(),
    title: 'Untitled',
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
    ...overrides,
  };
}

const initialTab = createDefaultTab();

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  sessionSaveTimer: null,

  addTab: (overrides) => {
    const newTab = createDefaultTab(overrides);
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

    const newTabs = state.tabs.filter((t) => t.id !== id);

    if (newTabs.length === 0) {
      // Last tab closed -> quit the app
      invoke('exit_app');
      return;
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
      tabs: state.tabs.map((t) => {
        if (t.id !== id) return t;
        // For untitled tabs (no filePath), reset dirty when content is empty
        const isDirty = !t.filePath && content === '' ? false : true;
        return { ...t, content, isDirty };
      }),
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
        t.id === id ? { ...t, isDirty: false } : t
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
          tabs: session.tabs.map((t) => ({
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
          })),
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
