import React, { useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { openUrl } from '@tauri-apps/plugin-opener';
import './Settings.css';

const IconGithub = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
);

// Native macOS Unfilled Double Chevron Icon
const IconDoubleChevron = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 4.5L4 2L6.5 4.5" />
        <path d="M1.5 7.5L4 10L6.5 7.5" />
    </svg>
);

export const Settings: React.FC = () => {
    const {
        isSettingsOpen, toggleSettings,
        theme, setTheme,
        fontFamily, setFontFamily, fontSize, setFontSize,
        wordWrap, toggleWordWrap
    } = useSettingsStore();

    const overlayRef = useRef<HTMLDivElement>(null);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            toggleSettings();
        }
    };

    const handleOpenLink = (e: React.MouseEvent, url: string) => {
        e.preventDefault();
        openUrl(url).catch(console.error);
    };

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isSettingsOpen) toggleSettings();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isSettingsOpen, toggleSettings]);

    if (!isSettingsOpen) return null;

    const getFontFamilyLabel = (val: string) => {
        if (val.includes('SF Mono')) return 'Monospace';
        if (val.includes('-apple-system')) return 'Sans Serif';
        if (val.includes('Georgia')) return 'Serif';
        if (val.includes('Courier New')) return 'Courier New';
        return 'Monospace';
    };

    const getThemeLabel = (val: string) => {
        if (val === 'light') return 'Light';
        if (val === 'dark') return 'Dark';
        return 'Use system setting';
    };

    return (
        <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="settings-modal">
                <div className="settings-header">
                    <span className="settings-title">Settings</span>
                    <button className="settings-close" onClick={toggleSettings} title="Close Settings">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="settings-content">
                    {/* Settings Group */}
                    <div className="settings-group">
                        {/* App Theme */}
                        <div className="settings-row">
                            <span className="settings-label">App theme</span>
                            <div className="settings-select-wrapper">
                                <select
                                    className="settings-select"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                                >
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                    <option value="system">Use system setting</option>
                                </select>
                                <span className="settings-select-label">{getThemeLabel(theme)}</span>
                                <span className="settings-select-chevron">
                                    <IconDoubleChevron />
                                </span>
                            </div>
                        </div>

                        {/* Font Family */}
                        <div className="settings-row">
                            <span className="settings-label">Font family</span>
                            <div className="settings-select-wrapper">
                                <select
                                    className="settings-select"
                                    value={fontFamily}
                                    onChange={(e) => setFontFamily(e.target.value)}
                                >
                                    <option value="SF Mono, Menlo, Consolas, monospace">Monospace</option>
                                    <option value="-apple-system, BlinkMacSystemFont, sans-serif">Sans Serif</option>
                                    <option value="Georgia, serif">Serif</option>
                                    <option value="Courier New, monospace">Courier New</option>
                                </select>
                                <span className="settings-select-label">{getFontFamilyLabel(fontFamily)}</span>
                                <span className="settings-select-chevron">
                                    <IconDoubleChevron />
                                </span>
                            </div>
                        </div>

                        {/* Font Size */}
                        <div className="settings-row">
                            <span className="settings-label">Font size</span>
                            <div className="settings-select-wrapper">
                                <select
                                    className="settings-select"
                                    value={fontSize}
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                >
                                    {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48].map(s => (
                                        <option key={s} value={s}>{s} px</option>
                                    ))}
                                </select>
                                <span className="settings-select-label">{fontSize} px</span>
                                <span className="settings-select-chevron">
                                    <IconDoubleChevron />
                                </span>
                            </div>
                        </div>

                        {/* Word Wrap */}
                        <div className="settings-row">
                            <span className="settings-label">Word wrap</span>
                            <div
                                className={`settings-toggle ${wordWrap ? 'active' : ''}`}
                                onClick={toggleWordWrap}
                                role="switch"
                                aria-checked={wordWrap}
                            >
                                <div className="settings-toggle-handle"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* About / Credits */}
                <div className="settings-footer">
                    <div className="settings-about">
                        <img src="/logo.svg" alt="Notepad" className="settings-app-icon" />
                        <div className="settings-about-text">
                            <div className="settings-app-header">
                                <span className="settings-app-name">Notepad</span>
                                <span className="settings-app-version">v1.0.4</span>
                            </div>
                            <span className="settings-fork-desc">
                                Forked from <a href="https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac.git" onClick={(e) => handleOpenLink(e, 'https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac.git')} className="settings-fork-link">Arijit's NotepadMac</a>
                            </span>
                        </div>
                    </div>
                    <a
                        href="https://github.com/dangphuc2470"
                        onClick={(e) => handleOpenLink(e, 'https://github.com/dangphuc2470')}
                        className="settings-credit"
                        title="View author profile on GitHub"
                    >
                        <IconGithub />
                        <span>Made by dangphuc2470</span>
                    </a>
                </div>
            </div>
        </div>
    );
};
