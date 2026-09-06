import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Families that ship with the app's own defaults, shown above the system list. */
export const BUILTIN_FONTS = [
    { label: 'Monospace', value: 'SF Mono, Menlo, Consolas, monospace' },
    { label: 'Sans Serif', value: '-apple-system, BlinkMacSystemFont, sans-serif' },
    { label: 'Serif', value: 'Georgia, serif' },
];

/**
 * Font families installed on the machine, read from CoreText via Rust.
 *
 * The Local Font Access API (queryLocalFonts) is Chromium-only, so there is no
 * way to enumerate fonts from the webview on macOS.
 */
export const useSystemFonts = () => {
    const [fonts, setFonts] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        void invoke<string[]>('list_system_fonts')
            .then((families) => {
                if (!cancelled) setFonts(families);
            })
            .catch(() => {
                /* not running under Tauri; the built-ins still work */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return fonts;
};
