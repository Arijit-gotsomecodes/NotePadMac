import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Published separately so the status bar can read it without prop drilling. */
export const useAutoSaveStatus = create<{
    status: AutoSaveStatus;
    setStatus: (status: AutoSaveStatus) => void;
}>((set) => ({
    status: 'idle',
    setStatus: (status) => set({ status }),
}));

/**
 * Writes tabs that already have a file on disk back to that file shortly after
 * you stop typing. Tabs with no path are untouched — those still go through
 * Save As, because we have nowhere to put them.
 */
export const useAutoSave = () => {
    const tabs = useEditorStore((s) => s.tabs);
    const markSaved = useEditorStore((s) => s.markSaved);
    const autoSave = useSettingsStore((s) => s.autoSave);
    const autoSaveDelay = useSettingsStore((s) => s.autoSaveDelay);

    const status = useAutoSaveStatus((s) => s.status);
    const setStatus = useAutoSaveStatus((s) => s.setStatus);
    // Tabs with a write currently in flight, so we never double-write one.
    const inFlight = useRef<Set<string>>(new Set());

    const pending = tabs.filter((t) => t.filePath && t.isDirty && !inFlight.current.has(t.id));

    useEffect(() => {
        if (!autoSave || pending.length === 0) {
            // Nothing queued any more (undone, saved manually, or switched off).
            if (useAutoSaveStatus.getState().status === 'pending') setStatus('idle');
            return;
        }

        setStatus('pending');
        const timer = setTimeout(async () => {
            // Re-read from the store: the debounce window may have moved on.
            const current = useEditorStore.getState().tabs;
            const due = current.filter(
                (t) => t.filePath && t.isDirty && !inFlight.current.has(t.id)
            );
            if (due.length === 0) return;

            setStatus('saving');
            let failed = false;

            for (const tab of due) {
                inFlight.current.add(tab.id);
                const snapshot = tab.content;
                try {
                    await invoke('write_file', {
                        path: tab.filePath,
                        content: snapshot,
                        encoding: tab.encoding,
                        lineEnding: tab.lineEnding,
                    });
                    markSaved(tab.id, snapshot);
                } catch (err) {
                    failed = true;
                    console.error('Auto-save failed:', err);
                } finally {
                    inFlight.current.delete(tab.id);
                }
            }

            setStatus(failed ? 'error' : 'saved');
        }, autoSaveDelay);

        return () => clearTimeout(timer);
        // `pending` is derived from `tabs`, which changes on every keystroke —
        // that is exactly what makes this debounce.
    }, [tabs, autoSave, autoSaveDelay, markSaved, setStatus]);

    // Drop the "Saved" badge back to neutral after a beat.
    useEffect(() => {
        if (status !== 'saved') return;
        const timer = setTimeout(() => setStatus('idle'), 2200);
        return () => clearTimeout(timer);
    }, [status, setStatus]);

    return status;
};
