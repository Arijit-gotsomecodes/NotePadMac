import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    theme: 'light' | 'dark' | 'system';
    wordWrap: boolean;
    zoom: number;
    showStatusBar: boolean;
    fontFamily: string;
    fontSize: number;
    autoSave: boolean;
    autoSaveDelay: number;
    showFindReplace: boolean;
    findReplaceMode: 'find' | 'replace';

    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    toggleWordWrap: () => void;
    setZoom: (zoom: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    toggleStatusBar: () => void;
    setFontFamily: (font: string) => void;
    setFontSize: (size: number) => void;
    toggleAutoSave: () => void;
    setAutoSaveDelay: (ms: number) => void;
    toggleFindReplace: (mode?: 'find' | 'replace') => void;
    closeFindReplace: () => void;
    isSettingsOpen: boolean;
    toggleSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            theme: 'system',
            wordWrap: true,
            zoom: 100,
            showStatusBar: true,
            fontFamily: 'SF Mono, Menlo, Consolas, monospace',
            fontSize: 14,
            autoSave: true,
            autoSaveDelay: 800,
            showFindReplace: false,
            findReplaceMode: 'find',
            isSettingsOpen: false,

            setTheme: (theme) => set({ theme }),
            toggleWordWrap: () => set((s) => ({ wordWrap: !s.wordWrap })),
            setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(500, zoom)) }),
            zoomIn: () => set((s) => ({ zoom: Math.min(500, s.zoom + 10) })),
            zoomOut: () => set((s) => ({ zoom: Math.max(50, s.zoom - 10) })),
            resetZoom: () => set({ zoom: 100 }),
            toggleStatusBar: () => set((s) => ({ showStatusBar: !s.showStatusBar })),
            setFontFamily: (fontFamily) => set({ fontFamily }),
            setFontSize: (fontSize) => set({ fontSize: Math.max(8, Math.min(72, fontSize)) }),
            toggleAutoSave: () => set((s) => ({ autoSave: !s.autoSave })),
            setAutoSaveDelay: (autoSaveDelay) =>
                set({ autoSaveDelay: Math.max(200, Math.min(10000, autoSaveDelay)) }),
            toggleFindReplace: (mode) =>
                set((s) => {
                    if (s.showFindReplace && s.findReplaceMode === (mode || 'find')) {
                        return { showFindReplace: false };
                    }
                    return { showFindReplace: true, findReplaceMode: mode || 'find' };
                }),
            closeFindReplace: () => set({ showFindReplace: false }),
            toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
        }),
        {
            name: 'notepadmac-settings',
            // Transient UI state stays out of storage.
            partialize: (s) => ({
                theme: s.theme,
                wordWrap: s.wordWrap,
                zoom: s.zoom,
                showStatusBar: s.showStatusBar,
                fontFamily: s.fontFamily,
                fontSize: s.fontSize,
                autoSave: s.autoSave,
                autoSaveDelay: s.autoSaveDelay,
            }),
        }
    )
);
