import { useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export const useTheme = () => {
    const { theme, reduceMotion } = useSettingsStore();

    const applyTheme = useCallback((isDark: boolean) => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }, []);

    useEffect(() => {
        // Mark all existing .app elements as revealed BEFORE toggling reduce-motion
        // so the window-reveal-entry animation never re-triggers on existing windows
        document.querySelectorAll('.app').forEach((el) => el.classList.add('is-revealed'));
        document.documentElement.classList.toggle('reduce-motion', reduceMotion);
    }, [reduceMotion]);

    useEffect(() => {
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            applyTheme(mediaQuery.matches);

            const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        } else {
            applyTheme(theme === 'dark');
        }
    }, [theme, applyTheme]);
};
