import React from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAutoSaveStatus } from '../hooks/useAutoSave';
import './StatusBar.css';

export const StatusBar: React.FC = () => {
    const { tabs, activeTabId } = useEditorStore();
    const { zoom, showStatusBar, autoSave } = useSettingsStore();
    const saveStatus = useAutoSaveStatus((s) => s.status);
    const activeTab = tabs.find((t) => t.id === activeTabId);

    if (!showStatusBar || !activeTab) return null;

    const charCount = activeTab.content.length;
    const lineCount = activeTab.content.split('\n').length;

    const renderSaveState = () => {
        if (!activeTab.filePath) {
            // Nowhere to auto-save to yet — say so instead of pretending.
            return activeTab.isDirty
                ? { label: 'Not saved to a file', tone: '' }
                : null;
        }
        if (!autoSave) {
            return activeTab.isDirty ? { label: 'Unsaved changes', tone: '' } : null;
        }
        if (saveStatus === 'error') return { label: 'Auto-save failed', tone: 'is-error' };
        if (saveStatus === 'saving') return { label: 'Saving…', tone: 'is-working' };
        if (saveStatus === 'pending') return { label: 'Editing…', tone: 'is-working' };
        if (activeTab.lastSavedAt) {
            return {
                label: `Saved ${new Date(activeTab.lastSavedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                })}`,
                tone: saveStatus === 'saved' ? 'is-saved' : '',
            };
        }
        return null;
    };

    const saveState = renderSaveState();

    return (
        <div className="status-bar">
            <div className="status-left">
                <span className="status-item">
                    Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
                </span>
                <span className="status-item">{charCount} characters</span>
                <span className="status-item">{lineCount} lines</span>
            </div>
            <div className="status-right">
                {saveState && (
                    <span className={`status-save ${saveState.tone}`}>
                        <span className="status-dot" />
                        {saveState.label}
                    </span>
                )}
                <span className="status-item">{zoom}%</span>
                <span className="status-item">{activeTab.encoding}</span>
                <span className="status-item">{activeTab.lineEnding}</span>
            </div>
        </div>
    );
};
