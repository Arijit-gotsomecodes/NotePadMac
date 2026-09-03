import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEditorStore } from '../stores/editorStore';

/**
 * The title bar is hidden, but macOS still shows the window title in Mission
 * Control, the Window menu and the app switcher — so keep it on the open file.
 */
export const useWindowTitle = () => {
    const tabs = useEditorStore((s) => s.tabs);
    const activeTabId = useEditorStore((s) => s.activeTabId);
    const activeTab = tabs.find((t) => t.id === activeTabId);

    const title = activeTab ? `${activeTab.title}${activeTab.isDirty ? ' — Edited' : ''}` : 'NotepadMac';

    useEffect(() => {
        try {
            // getCurrentWindow() throws synchronously outside Tauri, so the
            // guard has to wrap the call itself, not just the promise.
            void getCurrentWindow().setTitle(title).catch(() => undefined);
        } catch {
            /* running as a plain web page (`vite dev` in a browser) */
        }
    }, [title]);
};
