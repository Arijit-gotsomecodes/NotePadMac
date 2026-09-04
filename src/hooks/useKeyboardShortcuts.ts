import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileOperations } from './useFileOperations';

export const useKeyboardShortcuts = () => {
    const editorStore = useEditorStore();
    const settingsStore = useSettingsStore();
    const { handleOpen, handleSave, handleSaveAs } = useFileOperations();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMeta = e.metaKey;
            const isShift = e.shiftKey;

            if (!isMeta) {
                if (e.key === 'F5') {
                    e.preventDefault();
                    const tab = editorStore.getActiveTab();
                    if (!tab) return;
                    const now = new Date();
                    const dateStr = `${now.toLocaleTimeString()} ${now.toLocaleDateString()}`;
                    const textarea = document.querySelector('.editor-textarea') as HTMLTextAreaElement;
                    if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const newContent = tab.content.substring(0, start) + dateStr + tab.content.substring(end);
                        editorStore.pushUndo(tab.id, tab.content);
                        editorStore.updateContent(tab.id, newContent);
                        textarea.value = newContent;
                        textarea.selectionStart = textarea.selectionEnd = start + dateStr.length;
                    }
                }
                return;
            }

            // Cmd+1..8 jump to that tab, Cmd+9 to the last one (macOS standard).
            if (/^[1-9]$/.test(e.key)) {
                e.preventDefault();
                const { tabs } = editorStore;
                if (tabs.length === 0) return;
                const digit = parseInt(e.key, 10);
                const target = digit === 9 ? tabs[tabs.length - 1] : tabs[digit - 1];
                if (target) editorStore.setActiveTab(target.id);
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    editorStore.addTab();
                    break;

                case 't':
                    e.preventDefault();
                    if (isShift) {
                        editorStore.reopenClosedTab();
                    } else {
                        editorStore.addTab();
                    }
                    break;

                case 'o':
                    e.preventDefault();
                    handleOpen();
                    break;

                case 's':
                    e.preventDefault();
                    if (isShift) {
                        handleSaveAs();
                    } else {
                        handleSave();
                    }
                    break;

                case 'w':
                    e.preventDefault();
                    const tab = editorStore.getActiveTab();
                    if (tab) editorStore.closeTab(tab.id);
                    break;

                case 'f':
                    e.preventDefault();
                    settingsStore.toggleFindReplace('find');
                    break;

                case 'h':
                    e.preventDefault();
                    settingsStore.toggleFindReplace('replace');
                    break;

                case 'z':
                    e.preventDefault();
                    if (isShift) {
                        // Cmd+Shift+Z = Redo
                        const t = editorStore.getActiveTab();
                        if (t) editorStore.redo(t.id);
                    } else {
                        // Cmd+Z = Undo
                        const t = editorStore.getActiveTab();
                        if (t) editorStore.undo(t.id);
                    }
                    break;

                case 'y':
                    // Cmd+Y = Redo (alternative)
                    e.preventDefault();
                    {
                        const t = editorStore.getActiveTab();
                        if (t) editorStore.redo(t.id);
                    }
                    break;

                case '=':
                case '+':
                    e.preventDefault();
                    settingsStore.zoomIn();
                    break;

                case '-':
                    e.preventDefault();
                    settingsStore.zoomOut();
                    break;

                case '0':
                    e.preventDefault();
                    settingsStore.resetZoom();
                    break;
            }
        };

        // Handle zoom with scroll
        const handleWheel = (e: WheelEvent) => {
            if (e.metaKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    settingsStore.zoomIn();
                } else {
                    settingsStore.zoomOut();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('wheel', handleWheel);
        };
    }, [handleOpen, handleSave, handleSaveAs]);
};
