import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useFileOperations } from './useFileOperations';

/**
 * Opens files handed to us by macOS: Finder double-click, "Open With", or
 * `open -a NotepadMac file.txt`. Without this, the file associations declared
 * in tauri.conf.json would launch the app but never show the file.
 */
export const useFileOpenEvents = () => {
    const { openPath } = useFileOperations();

    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        let cancelled = false;

        void (async () => {
            try {
                // A cold launch fires Opened before this listener exists, so the
                // backend parks those paths for us to drain here.
                const pending = await invoke<string[]>('take_pending_files');
                for (const path of pending) {
                    if (cancelled) return;
                    await openPath(path);
                }
            } catch {
                /* not running under Tauri */
            }

            try {
                const off = await listen<string>('open-file-path', (event) => {
                    void openPath(event.payload);
                });
                if (cancelled) off();
                else unlisten = off;
            } catch {
                /* not running under Tauri */
            }
        })();

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [openPath]);
};
