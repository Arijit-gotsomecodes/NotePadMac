import React, { useRef, useEffect, useState } from 'react';
import { useFileOperations } from '../hooks/useFileOperations';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import './TabBar.css';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, addTab, closeTab } = useEditorStore();
    const { toggleSettings } = useSettingsStore();
    const { handleSave } = useFileOperations();
    const tabBarRef = useRef<HTMLDivElement>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [tabToClose, setTabToClose] = useState<string | null>(null);

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

    const handleStartClose = (id: string) => {
        const tab = tabs.find(t => t.id === id);
        // A tab backed by a file is auto-saved, so it never needs the prompt.
        if (tab && tab.isDirty && !tab.filePath) {
            setTabToClose(id);
            setModalOpen(true);
        } else {
            closeTab(id);
        }
    };

    const handleConfirmClose = () => {
        if (tabToClose) {
            closeTab(tabToClose);
            setTabToClose(null);
            setModalOpen(false);
        }
    };

    const handleSaveAndClose = async () => {
        if (tabToClose) {
            const success = await handleSave(tabToClose);
            if (success) {
                closeTab(tabToClose);
                setTabToClose(null);
                setModalOpen(false);
            }
        }
    };

    const handleCancelClose = () => {
        setTabToClose(null);
        setModalOpen(false);
    };

    const getTabTitle = () => {
        if (!tabToClose) return '';
        const tab = tabs.find(t => t.id === tabToClose);
        return tab ? tab.title : '';
    };

    return (
        <>
            {/* data-tauri-drag-region makes the bar itself draggable; children
                without the attribute stay clickable. */}
            <div className="tab-bar" data-tauri-drag-region>
                <div className="app-branding">
                    <img src="/logo.svg" alt="" className="app-logo" />
                </div>
                <div className="tab-list" ref={tabBarRef}>
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                            title={tab.filePath ?? tab.title}
                        >
                            {tab.isDirty && <span className="dirty-dot" />}
                            <span className="tab-title">{tab.title}</span>
                            <button
                                className="tab-close"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartClose(tab.id);
                                }}
                                title="Close Tab"
                            >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                    ))}
                    <button className="chrome-btn tab-add" onClick={() => addTab()} title="New Tab">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>

                <div
                    className="tab-drag-filler"
                    data-tauri-drag-region
                    title="Drag to move the window"
                />

                <div className="tab-actions">
                    <button className="chrome-btn" onClick={toggleSettings} title="Settings">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <UnsavedChangesModal
                isOpen={modalOpen}
                fileName={getTabTitle()}
                onSave={handleSaveAndClose}
                onDontSave={handleConfirmClose}
                onCancel={handleCancelClose}
            />
        </>
    );
};
