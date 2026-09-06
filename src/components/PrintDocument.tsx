import React from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePrintStore } from '../hooks/usePrint';
import './PrintDocument.css';

/**
 * What actually goes to the printer.
 *
 * Printing renders the live webview, so this sits outside `.app` and the print
 * stylesheet swaps the two: chrome hidden, this shown. It exists because a
 * <textarea> prints only the box you can see on screen; a block of text flows
 * across as many pages as it needs.
 */
export const PrintDocument: React.FC = () => {
    const tabs = useEditorStore((s) => s.tabs);
    const activeTabId = useEditorStore((s) => s.activeTabId);
    const fontFamily = useSettingsStore((s) => s.fontFamily);
    const heading = usePrintStore((s) => s.heading);
    const activeTab = tabs.find((t) => t.id === activeTabId);

    if (!activeTab) return null;

    return (
        <div className="print-document" aria-hidden="true">
            {heading === 'filename' && (
                <div className="print-title">{activeTab.title}</div>
            )}
            {/* Deliberately not the zoomed screen size: print uses points. */}
            <pre className="print-body" style={{ fontFamily }}>
                {activeTab.content}
            </pre>
        </div>
    );
};
