import { useCallback } from 'react';
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type PrintHeading = 'filename' | 'none';

export const usePrintStore = create<{
    isOpen: boolean;
    heading: PrintHeading;
    open: () => void;
    close: () => void;
    setHeading: (heading: PrintHeading) => void;
}>((set) => ({
    isOpen: false,
    heading: 'filename',
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    setHeading: (heading) => set({ heading }),
}));

/**
 * Hands off to the system print panel.
 *
 * Goes through a Rust command rather than window.print(): WKWebView does not
 * implement the JS print API, so window.print() is a silent no-op on macOS.
 */
export const useSystemPrint = () => {
    return useCallback(async () => {
        try {
            await invoke('print_document');
            return true;
        } catch (err) {
            console.error('Failed to open the print dialog:', err);
            return false;
        }
    }, []);
};

/** Opens the options dialog; printing itself happens once it is confirmed. */
export const usePrint = () => {
    const open = usePrintStore((s) => s.open);
    return useCallback(() => open(), [open]);
};
