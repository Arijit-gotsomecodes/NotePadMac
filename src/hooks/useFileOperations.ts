import { useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export const useFileOperations = () => {
    const editorStore = useEditorStore();

    /**
     * Reads a path and shows it in a tab. Deliberately reads the store through
     * getState so this stays referentially stable: the file-open listener keys
     * an effect off it, and subscribing to the store here would re-register
     * that listener on every keystroke.
     */
    const openPath = useCallback(async (path: string) => {
        try {
            const result = await invoke<{ content: string; encoding: string; line_ending: string }>(
                'read_file',
                { path }
            );
            const fileName = path.split('/').pop() || path.split('\\').pop() || 'Untitled';
            useEditorStore.getState().openFileInTab({
                title: fileName,
                filePath: path,
                content: result.content,
                encoding: result.encoding,
                lineEnding: result.line_ending,
            });
            return true;
        } catch (err) {
            console.error('Failed to open file:', err);
            return false;
        }
    }, []);

    const handleOpen = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [
                    { name: 'Text Files', extensions: ['txt', 'md', 'log', 'json', 'xml', 'csv', 'html', 'css', 'js', 'ts', 'py', 'rs', 'toml', 'yaml', 'yml'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (selected) {
                await openPath(typeof selected === 'string' ? selected : selected);
            }
        } catch (err) {
            console.error('Failed to open file:', err);
        }
    }, [openPath]);

    const handleSaveAs = useCallback(async (tabId?: string) => {
        const tab = tabId ? editorStore.tabs.find(t => t.id === tabId) : editorStore.getActiveTab();
        if (!tab) return false;

        try {
            const path = await save({
                defaultPath: tab.title === 'Untitled' ? 'Untitled.txt' : tab.title,
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (path) {
                await invoke('write_file', {
                    path,
                    content: tab.content,
                    encoding: tab.encoding,
                    lineEnding: tab.lineEnding,
                });
                const fileName = path.split('/').pop() || path.split('\\').pop() || 'Untitled';
                editorStore.setFilePath(tab.id, path, fileName);
                editorStore.setClean(tab.id);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Failed to save as:', err);
            return false;
        }
    }, [editorStore]);

    const handleSave = useCallback(async (tabId?: string) => {
        const tab = tabId ? editorStore.tabs.find(t => t.id === tabId) : editorStore.getActiveTab();
        if (!tab) return false;

        if (tab.filePath) {
            try {
                await invoke('write_file', {
                    path: tab.filePath,
                    content: tab.content,
                    encoding: tab.encoding,
                    lineEnding: tab.lineEnding,
                });
                editorStore.setClean(tab.id);
                return true;
            } catch (err) {
                console.error('Failed to save:', err);
                return false;
            }
        } else {
            return await handleSaveAs(tab.id);
        }
    }, [editorStore, handleSaveAs]);

    return {
        openPath,
        handleOpen,
        handleSave,
        handleSaveAs
    };
};
