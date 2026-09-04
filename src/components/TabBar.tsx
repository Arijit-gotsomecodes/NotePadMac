import React, { useRef, useEffect, useState } from 'react';
import { useFileOperations } from '../hooks/useFileOperations';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import './TabBar.css';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, addTab, closeTab, reorderTabs } = useEditorStore();
    const { toggleSettings } = useSettingsStore();
    const { handleSave } = useFileOperations();
    const tabBarRef = useRef<HTMLDivElement>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [tabToClose, setTabToClose] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    // Where the tab would land, and where to paint the snap line (px into the
    // tab strip). Nothing moves until release, so the drag stays stable.
    const [drop, setDrop] = useState<{ index: number; x: number } | null>(null);
    // How far the lifted tab has travelled from where it was grabbed.
    const [dragDx, setDragDx] = useState(0);
    // Mirrored in a ref so the pointerup handler can read the latest value
    // without the listener needing to be re-bound on every move.
    const dropRef = useRef<{ index: number; x: number } | null>(null);
    const dragRef = useRef<{ id: string; from: number; startX: number; active: boolean } | null>(null);
    // Set for the duration of the click that follows a real drag, so releasing
    // over another tab doesn't also select it.
    const suppressClick = useRef(false);

    useEffect(() => {
        // Scroll active tab into view
        const activeEl = tabBarRef.current?.querySelector('.tab.active');
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, [activeTabId]);

    const setDropTarget = (value: { index: number; x: number } | null) => {
        dropRef.current = value;
        setDrop(value);
    };

    /**
     * Reordering runs on pointer events, not HTML5 drag-and-drop: Tauri's native
     * drag-drop handler intercepts dragstart inside the webview, so `draggable`
     * tabs never actually begin a drag on macOS.
     */
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const state = dragRef.current;
            if (!state) return;

            // A few pixels of slop, so a plain click still selects the tab.
            if (!state.active) {
                if (Math.abs(e.clientX - state.startX) < 5) return;
                state.active = true;
                setDraggingId(state.id);
            }

            // Carry the tab with the pointer so the gesture reads as picking it
            // up, rather than the snap line moving on its own.
            setDragDx(e.clientX - state.startX);

            const list = tabBarRef.current;
            if (!list) return;
            // The dragged tab is excluded: it is translated under the pointer, so
            // hit-testing against it made the result depend on where the tab was
            // grabbed and behave differently going left versus right.
            const els = Array.from(list.querySelectorAll<HTMLElement>('.tab')).filter(
                (el) => el.dataset.tabId !== state.id
            );

            // Index among the remaining tabs, which is exactly the destination
            // index once the dragged tab has been lifted out of the array.
            let index = els.length;
            for (let i = 0; i < els.length; i += 1) {
                const rect = els[i].getBoundingClientRect();
                if (e.clientX < rect.left + rect.width / 2) {
                    index = i;
                    break;
                }
            }

            const target = els[index];
            const last = els[els.length - 1];
            setDropTarget({
                index,
                // offsetLeft is layout position, so it ignores the drag transform.
                x: target
                    ? target.offsetLeft
                    : last
                      ? last.offsetLeft + last.offsetWidth
                      : 0,
            });
        };

        const onUp = () => {
            const state = dragRef.current;
            const target = dropRef.current;
            dragRef.current = null;

            if (state?.active) {
                suppressClick.current = true;
                // target.index is already measured with the dragged tab removed,
                // so it needs no adjusting.
                if (target && target.index !== state.from) {
                    reorderTabs(state.from, target.index);
                }
                setDraggingId(null);
            }
            setDragDx(0);
            setDropTarget(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [reorderTabs]);

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
                    {drop && <div className="tab-drop-line" style={{ left: drop.x }} />}
                    {tabs.map((tab, index) => (
                        <div
                            key={tab.id}
                            data-tab-id={tab.id}
                            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.id === draggingId ? 'is-dragging' : ''}`}
                            onClick={() => {
                                if (suppressClick.current) {
                                    suppressClick.current = false;
                                    return;
                                }
                                setActiveTab(tab.id);
                            }}
                            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                            onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                // The close button is not a drag handle.
                                if ((e.target as HTMLElement).closest('.tab-close')) return;
                                dragRef.current = {
                                    id: tab.id,
                                    from: index,
                                    startX: e.clientX,
                                    active: false,
                                };
                            }}
                            title={tab.filePath ?? tab.title}
                            style={
                                tab.id === draggingId
                                    ? { transform: `translateX(${dragDx}px)` }
                                    : undefined
                            }
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
