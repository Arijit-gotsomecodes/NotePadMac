import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { useSettingsStore } from './settingsStore';

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
  closedTabsHistory: Tab[];

  // Actions
  addTab: (tab?: Partial<Tab>) => void;
  addMultipleTabs: (newTabs: Tab[]) => void;
  insertTabAtIndex: (tab: Tab, index: number) => void;
  closeTab: (id: string) => void;
  reopenClosedTab: () => void;
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
  detachTab: (id: string, screenX?: number, screenY?: number) => Promise<void>;
  initDetachedTab: (tab: Tab) => void;
  openFileInTab: (fileData: { title: string; filePath: string; content: string; encoding: string; lineEnding: string }) => void;
  duplicateTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  mergeWindows: () => void;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'tab-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
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
  closedTabsHistory: [],

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
    const closingTab = state.tabs.find((t) => t.id === id);
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1 || !closingTab) return;

    const newTabs = state.tabs.filter((t) => t.id !== id);
    const newClosedHistory = [...state.closedTabsHistory.slice(-29), closingTab];

    if (newTabs.length === 0) {
      const { reduceMotion } = useSettingsStore.getState();
      if (reduceMotion) {
        invoke('exit_app');
      } else {
        invoke('fade_close_window');
      }
      return;
    } else {
      let newActive = state.activeTabId;
      if (state.activeTabId === id) {
        // Switch to nearest tab
        const newIdx = Math.min(idx, newTabs.length - 1);
        newActive = newTabs[newIdx].id;
      }
      set({ tabs: newTabs, activeTabId: newActive, closedTabsHistory: newClosedHistory });
    }
    get().saveSession();
  },

  reopenClosedTab: () => {
    const state = get();
    if (state.closedTabsHistory.length === 0) return;
    const lastTab = state.closedTabsHistory[state.closedTabsHistory.length - 1];
    const newHistory = state.closedTabsHistory.slice(0, -1);

    // Ensure unique ID if restoring
    const existingIds = new Set(state.tabs.map((t) => t.id));
    const restoredTab: Tab = existingIds.has(lastTab.id)
      ? { ...lastTab, id: generateId() }
      : { ...lastTab };

    set((s) => ({
      tabs: [...s.tabs, restoredTab],
      activeTabId: restoredTab.id,
      closedTabsHistory: newHistory,
    }));
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
        // For untitled tabs (no filePath), derive title from first non-empty line of content
        let title = t.title;
        if (!t.filePath) {
          const firstLine = content.trim().split('\n')[0]?.trim();
          if (firstLine) {
            title = firstLine.length > 12 ? firstLine.slice(0, 12).trim() + '...' : firstLine;
          } else {
            title = 'Untitled';
          }
        }
        // For untitled tabs (no filePath), reset dirty when content is empty
        const isDirty = !t.filePath && content === '' ? false : true;
        return { ...t, content, isDirty, title };
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
        const state = get();
        if (state.tabs.length > 0 && !state.activeTabId) {
          set({ activeTabId: state.tabs[0].id });
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      const state = get();
      if (state.tabs.length > 0 && !state.activeTabId) {
        set({ activeTabId: state.tabs[0].id });
      }
    }
  },

  detachTab: async (id, screenX, screenY) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;

    try {
      await invoke('detach_tab', { tabJson: JSON.stringify(tab), x: screenX, y: screenY });
      
      // If this window only has 1 tab, create a new blank tab
      if (state.tabs.length === 1) {
        const freshTab = createDefaultTab();
        set({ tabs: [freshTab], activeTabId: freshTab.id });
      } else {
        const idx = state.tabs.findIndex((t) => t.id === id);
        const remaining = state.tabs.filter((t) => t.id !== id);
        let newActive = state.activeTabId;
        if (state.activeTabId === id) {
          const newIdx = Math.min(idx, remaining.length - 1);
          newActive = remaining[newIdx].id;
        }
        set({ tabs: remaining, activeTabId: newActive });
      }
      get().saveSession();
    } catch (err) {
      console.error('Failed to detach tab:', err);
    }
  },

  initDetachedTab: (tab) => {
    set({ tabs: [tab], activeTabId: tab.id });
  },

  openFileInTab: (fileData) => {
    const state = get();
    // 1. If file is already open in an existing tab, just focus it
    const existing = state.tabs.find((t) => t.filePath === fileData.filePath);
    if (existing) {
      set({ activeTabId: existing.id });
      get().saveSession();
      return;
    }

    // 2. If the current store only has 1 blank, clean Untitled tab, reuse and replace it
    const isSingleEmptyUntitled =
      state.tabs.length === 1 &&
      !state.tabs[0].filePath &&
      state.tabs[0].content === '' &&
      !state.tabs[0].isDirty;

    if (isSingleEmptyUntitled) {
      const targetId = state.tabs[0].id;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === targetId
            ? {
                ...t,
                ...fileData,
                id: targetId,
                isDirty: false,
                undoStack: [],
                redoStack: [],
                cursorLine: 1,
                cursorCol: 1,
                scrollTop: 0,
              }
            : t
        ),
        activeTabId: targetId,
      }));
    } else {
      const newTab = createDefaultTab({
        ...fileData,
        isDirty: false,
      });
      set((s) => ({
        tabs: [...s.tabs, newTab],
        activeTabId: newTab.id,
      }));
    }
    get().saveSession();
  },

  duplicateTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    get().addTab({
      title: `${tab.title} (Copy)`,
      filePath: null,
      content: tab.content,
      encoding: tab.encoding,
      lineEnding: tab.lineEnding,
      isDirty: true,
    });
  },

  closeOtherTabs: (id) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    const closingTabs = state.tabs.filter((t) => t.id !== id);
    const newClosedHistory = [...state.closedTabsHistory.slice(-(30 - closingTabs.length)), ...closingTabs];
    set({ tabs: [tab], activeTabId: tab.id, closedTabsHistory: newClosedHistory });
    get().saveSession();
  },

  reorderTabs: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set((state) => {
      const nextTabs = [...state.tabs];
      const [movedTab] = nextTabs.splice(fromIndex, 1);
      if (!movedTab) return state;
      nextTabs.splice(toIndex, 0, movedTab);
      return { tabs: nextTabs };
    });
    get().saveSession();
  },

  addMultipleTabs: (newTabs) => {
    set((state) => {
      // Filter out duplicate tabs that already exist with the same filePath or id
      const existingPaths = new Set(state.tabs.map(t => t.filePath).filter(Boolean));
      const existingIds = new Set(state.tabs.map(t => t.id));

      const filtered = newTabs.filter(t => {
        if (t.filePath && existingPaths.has(t.filePath)) return false;
        if (existingIds.has(t.id)) return false;
        return true;
      });

      if (filtered.length === 0) {
        const matched = state.tabs.find(t => newTabs.some(nt => nt.id === t.id || (nt.filePath && nt.filePath === t.filePath)));
        return matched ? { activeTabId: matched.id } : state;
      }

      return {
        tabs: [...state.tabs, ...filtered],
        activeTabId: filtered[filtered.length - 1].id,
      };
    });
    get().saveSession();
  },

  insertTabAtIndex: (tab, index) => {
    set((state) => {
      // If the tab is already in this window (by id or by filePath), just focus it
      const existing = state.tabs.find(t => t.id === tab.id || (t.filePath && t.filePath === tab.filePath));
      if (existing) {
        return { activeTabId: existing.id };
      }

      const nextTabs = [...state.tabs];
      const safeIndex = Math.max(0, Math.min(index, nextTabs.length));
      nextTabs.splice(safeIndex, 0, tab);
      return {
        tabs: nextTabs,
        activeTabId: tab.id,
      };
    });
    get().saveSession();
  },

  mergeWindows: async () => {
    try {
      const currentWin = getCurrentWindow();
      await emit('request-merge-tabs', { targetWindow: currentWin.label });
    } catch (err) {
      console.error('Failed to request merge:', err);
    }
  },
}));
