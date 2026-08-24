import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileOperations } from '../hooks/useFileOperations';
import './MenuBar.css';

// Lucide Icons (inline SVG components)
const IconFilePlus = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M9 15h6" /><path d="M12 12v6" /></svg>
);
const IconFolderOpen = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
);
const IconSave = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></svg>
);
const IconSaveAs = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>
);
const IconX = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
const IconUndo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
);
const IconRedo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>
);
const IconScissors = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" /></svg>
);
const IconCopy = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);
const IconClipboard = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
);
const IconTrash = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
);
const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconReplace = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4c0-1.1.9-2 2-2" /><path d="M20 2c1.1 0 2 .9 2 2" /><path d="M22 8c0 1.1-.9 2-2 2" /><path d="M16 10c-1.1 0-2-.9-2-2" /><path d="m3 7 3 3 3-3" /><path d="M6 10V5c0-1.7 1.3-3 3-3h1" /><path d="m21 17-3-3-3 3" /><path d="M18 14v5c0 1.7-1.3 3-3 3h-1" /><path d="M10 14c0 1.1-.9 2-2 2" /><path d="M4 14c-1.1 0-2 .9-2 2" /><path d="M2 20c0 1.1.9 2 2 2" /><path d="M8 22c1.1 0 2-.9 2-2" /></svg>
);
const IconSelectAll = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
);
const IconClock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
);
const IconZoomIn = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" /></svg>
);
const IconZoomOut = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" x2="14" y1="11" y2="11" /></svg>
);
const IconRotateCcw = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
);
const IconWrapText = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" x2="21" y1="6" y2="6" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="16 16 14 18 16 20" /><line x1="3" x2="10" y1="18" y2="18" /></svg>
);
const IconPanelBottom = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><line x1="3" x2="21" y1="15" y2="15" /></svg>
);
const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

type MenuId = 'file' | 'edit' | 'view' | null;

interface MenuItem {
    label: string;
    shortcut?: string;
    action?: () => void;
    divider?: boolean;
    toggle?: boolean;
    checked?: boolean;
    icon?: React.ReactNode;
}

export const MenuBar: React.FC = () => {
    const [openMenu, setOpenMenu] = useState<MenuId>(null);
    const menuBarRef = useRef<HTMLDivElement>(null);
    const editorStore = useEditorStore();
    const settingsStore = useSettingsStore();

    const { handleOpen, handleSave, handleSaveAs } = useFileOperations();

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNewTab = () => {
        editorStore.addTab();
        setOpenMenu(null);
    };

    const onOpen = async () => {
        setOpenMenu(null);
        await handleOpen();
    };

    const onSave = async () => {
        setOpenMenu(null);
        await handleSave();
    };

    const onSaveAs = async () => {
        setOpenMenu(null);
        await handleSaveAs();
    };

    const handleInsertDateTime = () => {
        setOpenMenu(null);
        const tab = editorStore.getActiveTab();
        if (!tab) return;
        const now = new Date();
        const dateStr = `${now.toLocaleTimeString()} ${now.toLocaleDateString()}`;
        const textarea = document.querySelector('.editor-textarea') as HTMLTextAreaElement;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newContent = tab.content.substring(0, start) + dateStr + tab.content.substring(end);
            editorStore.pushUndo(tab.id, tab.content);
            editorStore.updateContent(tab.id, newContent);
            textarea.value = newContent;
            textarea.selectionStart = textarea.selectionEnd = start + dateStr.length;
            textarea.focus();
        }
    };

    const fileMenu: MenuItem[] = [
        { label: 'New Tab', shortcut: '⌘N', icon: <IconFilePlus />, action: handleNewTab },
        { label: 'Open...', shortcut: '⌘O', icon: <IconFolderOpen />, action: onOpen },
        { label: 'Save', shortcut: '⌘S', icon: <IconSave />, action: onSave },
        { label: 'Save As...', shortcut: '⇧⌘S', icon: <IconSaveAs />, action: onSaveAs },
        { label: '', divider: true },
        { label: 'Close Tab', shortcut: '⌘W', icon: <IconX />, action: () => { setOpenMenu(null); const tab = editorStore.getActiveTab(); if (tab) editorStore.closeTab(tab.id); } },
    ];

    const editMenu: MenuItem[] = [
        { label: 'Undo', shortcut: '⌘Z', icon: <IconUndo />, action: () => { setOpenMenu(null); const tab = editorStore.getActiveTab(); if (tab) editorStore.undo(tab.id); } },
        { label: 'Redo', shortcut: '⇧⌘Z', icon: <IconRedo />, action: () => { setOpenMenu(null); const tab = editorStore.getActiveTab(); if (tab) editorStore.redo(tab.id); } },
        { label: '', divider: true },
        { label: 'Cut', shortcut: '⌘X', icon: <IconScissors />, action: () => { setOpenMenu(null); document.execCommand('cut'); } },
        { label: 'Copy', shortcut: '⌘C', icon: <IconCopy />, action: () => { setOpenMenu(null); document.execCommand('copy'); } },
        { label: 'Paste', shortcut: '⌘V', icon: <IconClipboard />, action: () => { setOpenMenu(null); document.execCommand('paste'); } },
        { label: 'Delete', icon: <IconTrash />, action: () => { setOpenMenu(null); document.execCommand('delete'); } },
        { label: '', divider: true },
        { label: 'Find...', shortcut: '⌘F', icon: <IconSearch />, action: () => { setOpenMenu(null); settingsStore.toggleFindReplace('find'); } },
        { label: 'Replace...', shortcut: '⌘H', icon: <IconReplace />, action: () => { setOpenMenu(null); settingsStore.toggleFindReplace('replace'); } },
        { label: '', divider: true },
        { label: 'Select All', shortcut: '⌘A', icon: <IconSelectAll />, action: () => { setOpenMenu(null); document.execCommand('selectAll'); } },
        { label: 'Time/Date', shortcut: 'F5', icon: <IconClock />, action: handleInsertDateTime },
    ];

    const viewMenu: MenuItem[] = [
        { label: 'Zoom In', shortcut: '⌘+', icon: <IconZoomIn />, action: () => { setOpenMenu(null); settingsStore.zoomIn(); } },
        { label: 'Zoom Out', shortcut: '⌘-', icon: <IconZoomOut />, action: () => { setOpenMenu(null); settingsStore.zoomOut(); } },
        { label: 'Reset Zoom', shortcut: '⌘0', icon: <IconRotateCcw />, action: () => { setOpenMenu(null); settingsStore.resetZoom(); } },
        { label: '', divider: true },
        { label: 'Word Wrap', icon: <IconWrapText />, toggle: true, checked: settingsStore.wordWrap, action: () => { setOpenMenu(null); settingsStore.toggleWordWrap(); } },
        { label: 'Status Bar', icon: <IconPanelBottom />, toggle: true, checked: settingsStore.showStatusBar, action: () => { setOpenMenu(null); settingsStore.toggleStatusBar(); } },
    ];

    const menus: { id: MenuId; label: string; items: MenuItem[] }[] = [
        { id: 'file', label: 'File', items: fileMenu },
        { id: 'edit', label: 'Edit', items: editMenu },
        { id: 'view', label: 'View', items: viewMenu },
    ];

    return (
        // data-tauri-drag-region on menu-bar container allows window drag
        // from empty space. The menu buttons inside do NOT have this attr
        // so clicks on them still work normally.
        <div
            className="menu-bar"
            ref={menuBarRef}
            data-tauri-drag-region
        >
            {menus.map((menu) => (
                <div className="menu-container" key={menu.id}>
                    <button
                        className={`menu-trigger ${openMenu === menu.id ? 'active' : ''}`}
                        onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                        onMouseEnter={() => {
                            if (openMenu !== null) setOpenMenu(menu.id);
                        }}
                    >
                        {menu.label}
                    </button>
                    {openMenu === menu.id && (
                        <div className="menu-dropdown">
                            {menu.items.map((item, i) =>
                                item.divider ? (
                                    <div className="menu-divider" key={i} />
                                ) : (
                                    <button
                                        className="menu-item"
                                        key={i}
                                        onClick={item.action}
                                    >
                                        <span className="menu-item-icon">
                                            {item.icon}
                                        </span>
                                        <span className="menu-item-label">{item.label}</span>
                                        {item.toggle && item.checked && (
                                            <span className="menu-item-check"><IconCheck /></span>
                                        )}
                                        {item.shortcut && (
                                            <span className="menu-item-shortcut">{item.shortcut}</span>
                                        )}
                                    </button>
                                )
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
