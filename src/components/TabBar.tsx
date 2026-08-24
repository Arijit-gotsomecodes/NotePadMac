import React, { useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';
import { useFileOperations } from '../hooks/useFileOperations';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import './TabBar.css';

export const TabBar: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, addTab, closeTab, detachTab, duplicateTab, closeOtherTabs, reorderTabs, mergeWindows } = useEditorStore();
    const { toggleSettings } = useSettingsStore();
    const { handleSave } = useFileOperations();
    const tabBarRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = React.useState<{ id: string; x: number; y: number } | null>(null);
    const [draggedId, setDraggedId] = React.useState<string | null>(null);
    const [dragTranslate, setDragTranslate] = React.useState<number>(0);
    const [isFloating, setIsFloating] = React.useState<boolean>(false);
    const [isCrossDropTarget, setIsCrossDropTarget] = React.useState<boolean>(false);
    const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    // Stores { id, prevLeft } for tabs that need FLIP animation after next render
    const flipPendingRef = useRef<Array<{ id: string; prevLeft: number }>>([]);

    // Run FLIP animation for neighbor tabs after each reorder
    React.useLayoutEffect(() => {
        for (const { id, prevLeft } of flipPendingRef.current) {
            const el = tabElementsRef.current.get(id);
            if (!el) continue;
            const newLeft = el.getBoundingClientRect().left;
            const delta = prevLeft - newLeft;
            if (Math.abs(delta) > 0.5) {
                el.animate(
                    [{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }],
                    { duration: 180, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }
                );
            }
        }
        flipPendingRef.current = [];
    }, [tabs]);

    useEffect(() => {
        let unlistenImport: (() => void) | undefined;
        let unlistenHighlight: (() => void) | undefined;

        listen<string>('import-tab', (e) => {
            try {
                const tab = JSON.parse(e.payload);
                useEditorStore.getState().addMultipleTabs([tab]);
            } catch (err) {
                console.error('Failed to import tab:', err);
            }
        }).then(u => { unlistenImport = u; });

        listen<{ targetWindow: string | null }>('highlight-drop-target', (e) => {
            const myLabel = getCurrentWindow().label;
            setIsCrossDropTarget(e.payload.targetWindow === myLabel);
        }).then(u => { unlistenHighlight = u; });

        const handleOutside = () => setContextMenu(null);
        window.addEventListener('click', handleOutside);
        window.addEventListener('contextmenu', handleOutside);
        return () => {
            window.removeEventListener('click', handleOutside);
            window.removeEventListener('contextmenu', handleOutside);
            unlistenImport?.();
            unlistenHighlight?.();
        };
    }, []);

    useEffect(() => {
        const activeEl = tabBarRef.current?.querySelector('.tab.active');
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, [activeTabId]);

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return;

        setActiveTab(id);

        const draggedEl = tabElementsRef.current.get(id);
        if (!draggedEl) return;

        const listEl = tabBarRef.current;
        if (!listEl) return;

        const tabRect = draggedEl.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();

        const startTabLeft = tabRect.left;
        const draggedWidth = tabRect.width;
        const startX = e.clientX;
        const startY = e.clientY;

        let isDragging = false;
        let lastPointerX = e.clientX;
        let lastSwapX = e.clientX;
        let lastSwapDirection: 'left' | 'right' | null = null;

        const onPointerMove = (moveEvent: PointerEvent) => {
            const frameDelta = moveEvent.clientX - lastPointerX;
            lastPointerX = moveEvent.clientX;

            const totalDist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (!isDragging && totalDist > 4) {
                isDragging = true;
                setDraggedId(id);
            }

            if (!isDragging) return;

            const pointerDelta = moveEvent.clientX - startX;

            // Check if floating outside the tab strip bounds
            const floatingOut = moveEvent.clientY < listRect.top - 15 || moveEvent.clientY > listRect.bottom + 25;
            setIsFloating(floatingOut);

            if (floatingOut) {
                const currentTab = useEditorStore.getState().tabs.find(t => t.id === id);
                invoke('show_drag_ghost', {
                    title: currentTab?.title || 'Untitled',
                    x: moveEvent.screenX,
                    y: moveEvent.screenY,
                }).catch(() => {});

                invoke<string | null>('check_drag_hover', {
                    sourceWindow: getCurrentWindow().label,
                    screenX: moveEvent.screenX,
                    screenY: moveEvent.screenY,
                }).then(targetWin => {
                    emit('highlight-drop-target', { targetWindow: targetWin });
                }).catch(() => {});
            } else {
                invoke('hide_drag_ghost').catch(() => {});
                emit('highlight-drop-target', { targetWindow: null });
            }

            // Clamped absolute visual position of the dragged tab on screen
            const minVisualLeft = listRect.left;
            const maxVisualLeft = listRect.right - draggedWidth;
            const visualLeft = Math.max(minVisualLeft, Math.min(maxVisualLeft, startTabLeft + pointerDelta));
            const visualRight = visualLeft + draggedWidth;

            // Current tabs and index
            const currentTabs = useEditorStore.getState().tabs;
            const fromIndex = currentTabs.findIndex(t => t.id === id);
            if (fromIndex === -1) return;

            // Calculate natural layout left of fromIndex in DOM (untransformed)
            let naturalLeft = listRect.left;
            for (let j = 0; j < fromIndex; j++) {
                const el = tabElementsRef.current.get(currentTabs[j].id);
                if (el) naturalLeft += el.getBoundingClientRect().width;
            }

            // Set transform so visual position matches visualLeft 1:1 strictly within the tab bar
            setDragTranslate(visualLeft - naturalLeft);

            // Don't reorder slots while tab is hovering far outside
            if (floatingOut) return;

            // Check right neighbor: moving right, covers >30% of right neighbor
            if (fromIndex < currentTabs.length - 1 && frameDelta >= 0) {
                const rightTab = currentTabs[fromIndex + 1];
                const rightEl = tabElementsRef.current.get(rightTab.id);
                if (rightEl) {
                    const rightRect = rightEl.getBoundingClientRect();
                    const overlapRight = visualRight - rightRect.left;
                    const hysteresisPassed = lastSwapDirection !== 'left' || Math.abs(moveEvent.clientX - lastSwapX) > 16;

                    if (overlapRight > rightRect.width * 0.3 && hysteresisPassed) {
                        lastSwapX = moveEvent.clientX;
                        lastSwapDirection = 'right';
                        // Record neighbor's current position before swap for FLIP
                        flipPendingRef.current.push({ id: rightTab.id, prevLeft: rightRect.left });
                        const newNaturalLeft = naturalLeft + rightRect.width;
                        setDragTranslate(visualLeft - newNaturalLeft);
                        reorderTabs(fromIndex, fromIndex + 1);
                        return;
                    }
                }
            }

            // Check left neighbor: moving left, covers >30% of left neighbor
            if (fromIndex > 0 && frameDelta <= 0) {
                const leftTab = currentTabs[fromIndex - 1];
                const leftEl = tabElementsRef.current.get(leftTab.id);
                if (leftEl) {
                    const leftRect = leftEl.getBoundingClientRect();
                    const overlapLeft = leftRect.right - visualLeft;
                    const hysteresisPassed = lastSwapDirection !== 'right' || Math.abs(moveEvent.clientX - lastSwapX) > 16;

                    if (overlapLeft > leftRect.width * 0.3 && hysteresisPassed) {
                        lastSwapX = moveEvent.clientX;
                        lastSwapDirection = 'left';
                        // Record neighbor's current position before swap for FLIP
                        flipPendingRef.current.push({ id: leftTab.id, prevLeft: leftRect.left });
                        const newNaturalLeft = naturalLeft - leftRect.width;
                        setDragTranslate(visualLeft - newNaturalLeft);
                        reorderTabs(fromIndex, fromIndex - 1);
                        return;
                    }
                }
            }
        };

        const onPointerUp = (upEvent: PointerEvent) => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);

            invoke('hide_drag_ghost').catch(() => {});
            emit('highlight-drop-target', { targetWindow: null });

            const isFarAway = upEvent.clientY < listRect.top - 20 || upEvent.clientY > listRect.bottom + 35;
            if (isDragging && isFarAway) {
                const currentTab = useEditorStore.getState().tabs.find(t => t.id === id);
                const currentTabs = useEditorStore.getState().tabs;
                const allowDetach = currentTabs.length > 1;

                if (currentTab) {
                    invoke<string>('finish_tab_drag', {
                        sourceWindow: getCurrentWindow().label,
                        tabJson: JSON.stringify(currentTab),
                        screenX: upEvent.screenX,
                        screenY: upEvent.screenY,
                        allowDetach,
                    }).then(async (result) => {
                        if (result === 'merged' || result === 'detached') {
                            const remaining = useEditorStore.getState().tabs.filter(t => t.id !== id);
                            if (remaining.length === 0) {
                                await getCurrentWindow().destroy();
                            } else {
                                useEditorStore.getState().closeTab(id);
                            }
                        }
                        setDraggedId(null);
                        setDragTranslate(0);
                        setIsFloating(false);
                    }).catch((err) => {
                        console.error(err);
                        setDraggedId(null);
                        setDragTranslate(0);
                        setIsFloating(false);
                    });
                    return;
                }
            }

            setDraggedId(null);
            setDragTranslate(0);
            setIsFloating(false);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    const handleMiddleClick = (e: React.MouseEvent, id: string) => {
        if (e.button === 1) {
            e.preventDefault();
            handleStartClose(id);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ id, x: e.clientX, y: e.clientY });
    };

    const handleStartClose = async (id: string) => {
        const tab = tabs.find(t => t.id === id);
        if (!tab) return;

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
        } else {
            closeTab(id);
        }
    };

    return (
        <div className={`tab-bar ${draggedId ? 'is-dragging-any' : ''}`} data-tauri-drag-region>
            <div
                className={`tab-list ${isCrossDropTarget ? 'is-cross-drop-target' : ''}`}
                ref={tabBarRef}
                data-tauri-drag-region
            >
                {tabs.map((tab) => {
                    const isDragging = tab.id === draggedId;
                    const style: React.CSSProperties = isDragging
                        ? {
                            transform: `translateX(${dragTranslate}px)`,
                            zIndex: 100,
                            transition: 'none',
                            opacity: isFloating ? 0 : 0.96,
                            pointerEvents: isFloating ? 'none' : 'auto',
                        }
                        : { transform: 'translateX(0)', transition: 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)' };

                    return (
                        <div
                            key={tab.id}
                            ref={(el) => {
                                if (el) tabElementsRef.current.set(tab.id, el);
                                else tabElementsRef.current.delete(tab.id);
                            }}
                            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${isDragging ? 'is-dragging' : ''}`}
                            style={style}
                            onPointerDown={(e) => handlePointerDown(e, tab.id)}
                            onClick={() => {
                                if (!draggedId) setActiveTab(tab.id);
                            }}
                            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                            onContextMenu={(e) => handleContextMenu(e, tab.id)}
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
                    );
                })}
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

            {/* Actions container */}
            <div className="tab-actions" data-tauri-drag-region>
                <button className="settings-btn" onClick={toggleSettings} title="Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>
            </div>

            {/* Tab Context Menu */}
            {contextMenu && (
                <div
                    className="tab-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="tab-context-item"
                        onClick={() => {
                            detachTab(contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <span>Move to New Window</span>
                        <span className="tab-context-shortcut">⇧⌘N</span>
                    </div>
                    <div
                        className="tab-context-item"
                        onClick={() => {
                            mergeWindows();
                            setContextMenu(null);
                        }}
                    >
                        <span>Merge All Windows</span>
                    </div>
                    <div
                        className="tab-context-item"
                        onClick={() => {
                            duplicateTab(contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <span>Duplicate Tab</span>
                    </div>
                    <div className="tab-context-divider" />
                    <div
                        className="tab-context-item"
                        onClick={() => {
                            handleStartClose(contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <span>Close Tab</span>
                        <span className="tab-context-shortcut">⌘W</span>
                    </div>
                    <div
                        className="tab-context-item"
                        onClick={() => {
                            closeOtherTabs(contextMenu.id);
                            setContextMenu(null);
                        }}
                    >
                        <span>Close Other Tabs</span>
                    </div>
                </div>
            )}
        </div>
    );
};
