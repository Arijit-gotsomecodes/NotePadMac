import React, { useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import './Settings.css';

// Icons
const IconBrush = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="0.5" /><circle cx="17.5" cy="10.5" r="0.5" /><circle cx="8.5" cy="7.5" r="0.5" /><circle cx="6.5" cy="12.5" r="0.5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" /></svg>
);

const IconType = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
);

const IconWrap = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="16 16 14 18 16 20" /><path d="M3 18h7" /></svg>
);

const IconSaveClock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M12 11v3l2 1" /><circle cx="12" cy="14" r="4" /></svg>
);

const IconGithub = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
);

export const Settings: React.FC = () => {
    const {
        isSettingsOpen, toggleSettings,
        theme, setTheme,
        fontFamily, setFontFamily, fontSize, setFontSize,
        wordWrap, toggleWordWrap,
        autoSave, toggleAutoSave, autoSaveDelay, setAutoSaveDelay
    } = useSettingsStore();

    const overlayRef = useRef<HTMLDivElement>(null);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            toggleSettings();
        }
    };

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isSettingsOpen) toggleSettings();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isSettingsOpen, toggleSettings]);

    if (!isSettingsOpen) return null;

    return (
        <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="settings-modal">
                <div className="settings-header">
                    <span className="settings-title">Settings</span>
                    <button className="settings-close" onClick={toggleSettings}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="settings-content">
                    <div className="settings-group">
                        <span className="settings-group-title">Appearance</span>
                        <div className="settings-section">
                            <div className="settings-row">
                                <div className="settings-info">
                                    <div className="settings-icon"><IconBrush /></div>
                                    <div className="settings-label-group">
                                        <span className="settings-label">App theme</span>
                                        <span className="settings-desc">Select which app theme to display</span>
                                    </div>
                                </div>
                                <select
                                    className="settings-select"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                                >
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                    <option value="system">Use system setting</option>
                                </select>
                            </div>

                            <div className="settings-row">
                                <div className="settings-info">
                                    <div className="settings-icon"><IconType /></div>
                                    <div className="settings-label-group">
                                        <span className="settings-label">Font</span>
                                        <span className="settings-desc">Family and size</span>
                                    </div>
                                </div>
                                <div className="settings-controls">
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
                                    <select
                                        className="settings-select settings-select-small"
                                        value={fontSize}
                                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    >
                                        {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48].map(s => (
                                            <option key={s} value={s}>{s}px</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-group-title">Editor</span>
                        <div className="settings-section">
                            <div className="settings-row">
                                <div className="settings-info">
                                    <div className="settings-icon"><IconWrap /></div>
                                    <div className="settings-label-group">
                                        <span className="settings-label">Word wrap</span>
                                        <span className="settings-desc">Wrap long lines of text</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={wordWrap}
                                    aria-label="Word wrap"
                                    className={`settings-toggle ${wordWrap ? 'active' : ''}`}
                                    onClick={toggleWordWrap}
                                >
                                    <span className="settings-toggle-handle" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-group-title">Files</span>
                        <div className="settings-section">
                            <div className="settings-row">
                                <div className="settings-info">
                                    <div className="settings-icon"><IconSaveClock /></div>
                                    <div className="settings-label-group">
                                        <span className="settings-label">Auto-save</span>
                                        <span className="settings-desc">
                                            Save tabs that already have a file, as you type
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoSave}
                                    aria-label="Auto-save"
                                    className={`settings-toggle ${autoSave ? 'active' : ''}`}
                                    onClick={toggleAutoSave}
                                >
                                    <span className="settings-toggle-handle" />
                                </button>
                            </div>
                            <div className={`settings-row settings-subrow ${autoSave ? '' : 'is-disabled'}`}>
                                <div className="settings-label-group">
                                    <span className="settings-label">Save after</span>
                                    <span className="settings-desc">How long to wait once you stop typing</span>
                                </div>
                                <select
                                    className="settings-select settings-select-small"
                                    value={autoSaveDelay}
                                    onChange={(e) => setAutoSaveDelay(parseInt(e.target.value))}
                                >
                                    <option value={400}>0.4s</option>
                                    <option value={800}>0.8s</option>
                                    <option value={1500}>1.5s</option>
                                    <option value={3000}>3s</option>
                                    <option value={5000}>5s</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* About / Credits */}
                <div className="settings-footer">
                    <div className="settings-about">
                        <img src="/logo.svg" alt="NotepadMac" className="settings-app-icon" />
                        <div className="settings-app-info">
                            <span className="settings-app-name">NotepadMac</span>
                            <span className="settings-app-version">Version {__APP_VERSION__}</span>
                        </div>
                    </div>
                    <a
                        href="https://github.com/Arijit-gotsomecodes"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="settings-credit"
                    >
                        <IconGithub />
                        <span>Made by Arijit</span>
                    </a>
                </div>
            </div>
        </div>
    );
};
