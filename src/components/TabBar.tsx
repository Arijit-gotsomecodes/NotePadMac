import React, { useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileOperations } from '../hooks/useFileOperations';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import './TabBar.css';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, addTab, closeTab } = useEditorStore();
    const { toggleSettings } = useSettingsStore();
    const { handleSave } = useFileOperations();
    const tabBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Scroll active tab into view
        const activeEl = tabBarRef.current?.querySelector('.tab.active');
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, [activeTabId]);

    const handleMiddleClick = (e: React.MouseEvent, id: string) => {
        if (e.button === 1) {
            e.preventDefault();
            handleStartClose(id);
        }
    };

    const handleStartClose = async (id: string) => {
        const tab = tabs.find(t => t.id === id);
        if (!tab) return;

        // If this is an untitled tab with no content, just close it directly
        const isEmptyUntitled = !tab.filePath && tab.content.trim() === '';

        if (tab.isDirty && !isEmptyUntitled) {
            const action = await invoke<string>('prompt_save_dialog', {
                documentName: tab.title || 'Untitled',
            });

            if (action === 'save') {
                const success = await handleSave(id);
                if (success) {
                    closeTab(id);
                }
            } else if (action === 'dont_save') {
                closeTab(id);
            }
            // 'cancel' does nothing
        } else {
            closeTab(id);
        }
    };

    return (
        // data-tauri-drag-region on the outermost container only.
        // Tauri's WKWebView subclass intercepts mousedown at OS level for this attr,
        // which is the ONLY reliable method on macOS regardless of focus state.
        <div className="tab-bar" data-tauri-drag-region>
            {/* tab-list: drag region on the list itself, but NOT on child .tab divs */}
            <div className="tab-list" ref={tabBarRef} data-tauri-drag-region>
                {tabs.map((tab) => (
                    // Individual tabs do NOT have data-tauri-drag-region so
                    // onClick still fires normally for tab switching.
                    <div
                        key={tab.id}
                        className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                    >
                        <span className="tab-title">
                            {tab.title}
                        </span>
                        <button
                            className={`tab-close ${tab.isDirty ? 'is-dirty' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStartClose(tab.id);
                            }}
                            title="Close"
                        >
                            {tab.isDirty && <span className="tab-indicator-dirty" />}
                            <span className="tab-indicator-close">×</span>
                        </button>
                        <div className="tab-divider" />
                    </div>
                ))}
                {/* The add button is NOT a drag region */}
                <button className="tab-add" onClick={() => addTab()} title="New Tab">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                {/* Spacer is pure drag area */}
                <div className="tab-drag-spacer" data-tauri-drag-region />
            </div>

            {/* Actions container: drag region, buttons inside are not */}
            <div className="tab-actions" data-tauri-drag-region>
                <button className="settings-btn" onClick={toggleSettings} title="Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>
            </div>
        </div>
    );
};
