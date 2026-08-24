import { useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export async function saveAsTab(tabId?: string): Promise<boolean> {
    const editorStore = useEditorStore.getState();
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
}

export async function saveTab(tabId?: string): Promise<boolean> {
    const editorStore = useEditorStore.getState();
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
        return await saveAsTab(tab.id);
    }
}

export async function openFilePath(path: string): Promise<void> {
    const editorStore = useEditorStore.getState();

    // 1. If file is already open in an existing tab, just switch to it
    const existingTab = editorStore.tabs.find(t => t.filePath === path);
    if (existingTab) {
        editorStore.setActiveTab(existingTab.id);
        return;
    }

    try {
        const result = await invoke<{ content: string; encoding: string; line_ending: string }>('read_file', { path });
        const fileName = path.split('/').pop() || path.split('\\').pop() || 'Untitled';
        
        // 2. If the current active tab is an empty untitled tab and not modified, replace it
        const activeTab = editorStore.getActiveTab();
        if (activeTab && !activeTab.filePath && activeTab.content === '' && !activeTab.isDirty) {
            editorStore.setFilePath(activeTab.id, path, fileName);
            editorStore.updateContent(activeTab.id, result.content);
            editorStore.setEncoding(activeTab.id, result.encoding);
            editorStore.setLineEnding(activeTab.id, result.line_ending);
            editorStore.setClean(activeTab.id);
        } else {
            editorStore.addTab({
                title: fileName,
                filePath: path,
                content: result.content,
                encoding: result.encoding,
                lineEnding: result.line_ending,
                isDirty: false,
            });
        }
    } catch (err) {
        console.error('Failed to open file from path:', err);
    }
}

export async function openFileToTab(): Promise<void> {
    try {
        const selected = await open({
            multiple: false,
            filters: [
                { name: 'Text Files', extensions: ['txt', 'md', 'log', 'json', 'xml', 'csv', 'html', 'css', 'js', 'ts', 'py', 'rs', 'toml', 'yaml', 'yml'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        if (selected) {
            const path = typeof selected === 'string' ? selected : selected;
            await openFilePath(path);
        }
    } catch (err) {
        console.error('Failed to open file:', err);
    }
}

export const useFileOperations = () => {
    const handleOpen = useCallback(() => openFileToTab(), []);
    const handleSave = useCallback((tabId?: string) => saveTab(tabId), []);
    const handleSaveAs = useCallback((tabId?: string) => saveAsTab(tabId), []);

    return {
        handleOpen,
        handleSave,
        handleSaveAs
    };
};
