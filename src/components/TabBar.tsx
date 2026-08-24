import React, { useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
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
    const isCrossDropTargetRef = useRef<boolean>(false);
    const [crossDropIndex, setCrossDropIndex] = React.useState<number | null>(null);
    const crossDropIndexRef = useRef<number | null>(null);
    const [isWindowDimmed, setIsWindowDimmed] = React.useState<boolean>(false);
    const [isNearOwnTabBar, setIsNearOwnTabBar] = React.useState<boolean>(false);
    const [justImportedId, setJustImportedId] = React.useState<string | null>(null);
    const [newlyAddedId, setNewlyAddedId] = React.useState<string | null>(null);
    const [closingTabIds, setClosingTabIds] = React.useState<Set<string>>(new Set());
    const mountedRef = useRef<boolean>(false);
    const prevTabIdsRef = useRef<Set<string>>(new Set(tabs.map(t => t.id)));
    const floatingAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const windowCountRef = useRef<number>(1);
    const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    // Stores { id, prevLeft } for tabs that need FLIP animation after next render
    const flipPendingRef = useRef<Array<{ id: string; prevLeft: number }>>([]);

    // Detect newly added tabs for smooth entry expand animation
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            prevTabIdsRef.current = new Set(tabs.map(t => t.id));
            return;
        }
        for (const t of tabs) {
            if (!prevTabIdsRef.current.has(t.id)) {
                setNewlyAddedId(t.id);
                setTimeout(() => {
                    setNewlyAddedId(null);
                }, 180);
                break;
            }
        }
        prevTabIdsRef.current = new Set(tabs.map(t => t.id));
    }, [tabs]);

    // Run FLIP animation for neighbor tabs after each reorder
    React.useLayoutEffect(() => {
        const { reduceMotion } = useSettingsStore.getState();
        if (reduceMotion) {
            flipPendingRef.current = [];
            return;
        }
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

        listen<any>('import-tab', (e) => {
            try {
                // Payload can be:
                // 1. New format: { tab_json: string, local_x: number } from finish_tab_drag
                // 2. Legacy format: string (tab JSON) from try_merge_window
                let tab: any;
                let localX: number | null = null;

                if (e.payload && typeof e.payload === 'object' && e.payload.tab_json) {
                    tab = typeof e.payload.tab_json === 'string' ? JSON.parse(e.payload.tab_json) : e.payload.tab_json;
                    localX = typeof e.payload.local_x === 'number' ? e.payload.local_x : null;
                } else {
                    tab = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
                }

                if (!tab || typeof tab !== 'object') return;
                setJustImportedId(tab.id);

                // Calculate insert index from local_x (cursor position relative to this window)
                let insertIdx: number | null = null;
                if (localX !== null) {
                    const currentTabs = useEditorStore.getState().tabs;
                    insertIdx = currentTabs.length; // default: append at end
                    for (let i = 0; i < currentTabs.length; i++) {
                        const el = tabElementsRef.current.get(currentTabs[i].id);
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            const midX = rect.left + rect.width / 2;
                            if (localX < midX) {
                                insertIdx = i;
                                break;
                            }
                        }
                    }
                }

                if (insertIdx !== null) {
                    useEditorStore.getState().insertTabAtIndex(tab, insertIdx);
                } else {
                    useEditorStore.getState().addMultipleTabs([tab]);
                }
                setCrossDropIndex(null);
                crossDropIndexRef.current = null;
                isCrossDropTargetRef.current = false;
                setIsCrossDropTarget(false);
                setTimeout(() => setJustImportedId(null), 400);
            } catch (err) {
                console.error('Failed to import tab:', err);
            }
        }).then(u => { unlistenImport = u; });

        listen<{ target_window?: string | null; targetWindow?: string | null; local_x?: number }>('highlight-drop-target', (e) => {
            const myLabel = getCurrentWindow().label;
            const targetWin = e.payload.target_window ?? e.payload.targetWindow ?? null;
            if (targetWin === myLabel) {
                isCrossDropTargetRef.current = true;
                setIsCrossDropTarget(true);
                const localX = e.payload.local_x;
                if (typeof localX === 'number') {
                    const currentTabs = useEditorStore.getState().tabs;
                    let insertIdx = currentTabs.length;
                    for (let i = 0; i < currentTabs.length; i++) {
                        const el = tabElementsRef.current.get(currentTabs[i].id);
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            const midX = rect.left + rect.width / 2;
                            if (localX < midX) {
                                insertIdx = i;
                                break;
                            }
                        }
                    }
                    setCrossDropIndex(insertIdx);
                    crossDropIndexRef.current = insertIdx;
                } else {
                    setCrossDropIndex(null);
                    crossDropIndexRef.current = null;
                }
            } else {
                isCrossDropTargetRef.current = false;
                setIsCrossDropTarget(false);
                setCrossDropIndex(null);
                crossDropIndexRef.current = null;
            }
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

    const [scrollState, setScrollState] = React.useState<{ canScrollLeft: boolean; canScrollRight: boolean }>({
        canScrollLeft: false,
        canScrollRight: false,
    });

    const updateScrollState = React.useCallback(() => {
        const el = tabBarRef.current;
        if (!el) return;
        const canLeft = el.scrollLeft > 2;
        const canRight = Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 2;
        setScrollState(prev => {
            if (prev.canScrollLeft === canLeft && prev.canScrollRight === canRight) return prev;
            return { canScrollLeft: canLeft, canScrollRight: canRight };
        });
    }, []);

    useEffect(() => {
        const el = tabBarRef.current;
        if (!el) return;
        updateScrollState();

        const handleScroll = () => updateScrollState();
        el.addEventListener('scroll', handleScroll, { passive: true });

        const resizeObserver = new ResizeObserver(() => updateScrollState());
        resizeObserver.observe(el);

        return () => {
            el.removeEventListener('scroll', handleScroll);
            resizeObserver.disconnect();
        };
    }, [tabs, updateScrollState]);

    useEffect(() => {
        const activeEl = tabBarRef.current?.querySelector('.tab.active');
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, [activeTabId]);

    useEffect(() => {
        const appEl = document.querySelector('.app');
        if (appEl) {
            if (isWindowDimmed) {
                appEl.classList.add('is-tab-floating');
            } else {
                appEl.classList.remove('is-tab-floating');
            }
        }
        return () => {
            document.querySelector('.app')?.classList.remove('is-tab-floating');
        };
    }, [isWindowDimmed]);

    const handlePointerDown = async (e: React.PointerEvent, id: string) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return;

        setActiveTab(id);

        const winCount = await invoke<number>('get_window_count').catch(() => 1);
        windowCountRef.current = winCount;

        // When there is only 1 tab, drag the entire window natively instead of creating a ghost
        // NOTE: startDragging() resolves immediately — we must use pointerup to detect drag end
        const currentTabs = useEditorStore.getState().tabs;
        if (currentTabs.length <= 1) {
            const currentTab = currentTabs[0];

            if (winCount > 1) {
                setIsWindowDimmed(true);
            }

            // Calculate the drag offset (cursor position relative to window top-left)
            // so we can estimate cursor screen coordinates as the window moves
            let unlistenMoved: (() => void) | undefined;
            try {
                const outerPos = await getCurrentWindow().outerPosition();
                const scale = window.devicePixelRatio || 1;
                const dragOffsetX = e.screenX - outerPos.x / scale;
                const dragOffsetY = e.screenY - outerPos.y / scale;

                // Track window movement to show placeholder in target windows
                unlistenMoved = await getCurrentWindow().onMoved(({ payload: pos }) => {
                    const estimatedCursorX = pos.x / scale + dragOffsetX;
                    const estimatedCursorY = pos.y / scale + dragOffsetY;
                    invoke<{ target_window: string; local_x: number } | null>('check_drag_hover', {
                        sourceWindow: getCurrentWindow().label,
                        screenX: estimatedCursorX,
                        screenY: estimatedCursorY,
                    }).then(targetWin => {
                        emit('highlight-drop-target', targetWin || { target_window: null });
                    }).catch(() => {});
                });
            } catch (_) { /* outerPosition or onMoved failed — placeholder will just not show */ }

            // Listen for mouse release to attempt merge, only restoring dim if NOT merged
            const onSingleTabPointerUp = async (upEvent?: PointerEvent) => {
                window.removeEventListener('pointerup', onSingleTabPointerUp);
                unlistenMoved?.();
                emit('highlight-drop-target', { target_window: null });
                if (currentTab) {
                    try {
                        const merged = await invoke<boolean>('try_merge_window', {
                            sourceWindow: getCurrentWindow().label,
                            tabJson: JSON.stringify(currentTab),
                            screenX: upEvent?.screenX ?? null,
                            screenY: upEvent?.screenY ?? null,
                        });
                        if (!merged) {
                            setIsWindowDimmed(false);
                        }
                    } catch (err) {
                        setIsWindowDimmed(false);
                        console.error('try_merge_window error:', err);
                    }
                } else {
                    setIsWindowDimmed(false);
                }
            };
            window.addEventListener('pointerup', onSingleTabPointerUp);

            try {
                await getCurrentWindow().startDragging();
            } catch (err) {
                window.removeEventListener('pointerup', onSingleTabPointerUp);
                unlistenMoved?.();
                emit('highlight-drop-target', { target_window: null });
                setIsWindowDimmed(false);
                console.error('Window drag error:', err);
            }
            return;
        }

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
        // Track floating state synchronously inside closure (React state updates are async)
        const isFloatingRef = { current: false };

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

            // Two separate thresholds to prevent boundary oscillation (hysteresis):
            // - Enter floating: cross vertical threshold or drag past left/right tab bar edges with clear intention
            // - Exit floating: smoothly snaps back once cursor is within generous tab bar area
            const ENTER_THRESHOLD_TOP = 22;
            const ENTER_THRESHOLD_BOTTOM = 28;
            const ENTER_THRESHOLD_HORIZ = 45;

            const isOutsideV = moveEvent.clientY < listRect.top - ENTER_THRESHOLD_TOP || moveEvent.clientY > listRect.bottom + ENTER_THRESHOLD_BOTTOM;
            const isOutsideH = moveEvent.clientX < listRect.left - ENTER_THRESHOLD_HORIZ || moveEvent.clientX > listRect.right + ENTER_THRESHOLD_HORIZ;
            const enterFloat = isOutsideV || isOutsideH;

            const isInsideV = moveEvent.clientY >= listRect.top - 8 && moveEvent.clientY <= listRect.bottom + 12;
            const isInsideH = moveEvent.clientX >= listRect.left - 20 && moveEvent.clientX <= listRect.right + 20;
            const exitFloat = isInsideV && isInsideH;

            if (enterFloat && !isFloatingRef.current) {
                // Entering floating:
                // flushSync forces an immediate synchronous render so opacity=0 is committed
                // to the DOM *before* show_drag_ghost fires. This closes the race window where
                // the tab is still visible at its old position while the ghost hasn't appeared.
                isFloatingRef.current = true;
                if (floatingAnimTimerRef.current) clearTimeout(floatingAnimTimerRef.current);
                flushSync(() => {
                    setIsFloating(true);
                });
                // Reset translate after the width collapse transition finishes
                // This prevents the tab from visually flying back to origin before it fades out
                floatingAnimTimerRef.current = setTimeout(() => {
                    setDragTranslate(0);
                }, 200) as unknown as number;

                const currentTab = useEditorStore.getState().tabs.find(t => t.id === id);
                invoke('show_drag_ghost', {
                    title: currentTab?.title || 'Untitled',
                    x: moveEvent.screenX,
                    y: moveEvent.screenY,
                    width: draggedWidth,
                }).catch(() => {});

                invoke<{ target_window: string; local_x: number } | null>('check_drag_hover', {
                    sourceWindow: getCurrentWindow().label,
                    screenX: moveEvent.screenX,
                    screenY: moveEvent.screenY,
                }).then(targetWin => {
                    emit('highlight-drop-target', targetWin || { target_window: null });
                }).catch(() => {});
            } else if (isFloatingRef.current) {
                if (exitFloat) {
                    // Returning: must be well inside tab bar before snapping back
                    isFloatingRef.current = false;
                    invoke('hide_drag_ghost').catch(() => {});
                    emit('highlight-drop-target', { target_window: null });
                    if (floatingAnimTimerRef.current) clearTimeout(floatingAnimTimerRef.current);
                    setIsFloating(false);
                } else {
                    // Still floating: use move_drag_ghost (position-only, no overhead)
                    // instead of show_drag_ghost to avoid redundant IPC and title emit every frame
                    invoke('move_drag_ghost', {
                        x: moveEvent.screenX,
                        y: moveEvent.screenY,
                    }).catch(() => {});

                    invoke<{ target_window: string; local_x: number } | null>('check_drag_hover', {
                        sourceWindow: getCurrentWindow().label,
                        screenX: moveEvent.screenX,
                        screenY: moveEvent.screenY,
                    }).then(targetWin => {
                        emit('highlight-drop-target', targetWin || { target_window: null });
                    }).catch(() => {});
                }
            } else {
                invoke('hide_drag_ghost').catch(() => {});
                emit('highlight-drop-target', { target_window: null });
            }

            // Only dim this window when the floating ghost is dragged down into its text editing area below the tab bar, and ONLY if multiple windows exist
            const isInsideEditor = moveEvent.clientX >= 0 && moveEvent.clientX <= window.innerWidth && moveEvent.clientY > listRect.bottom + 10 && moveEvent.clientY <= window.innerHeight;
            setIsWindowDimmed(isFloatingRef.current && isInsideEditor && windowCountRef.current > 1);

            // Only show own-window placeholder when hovering close to its own tab bar
            const isNearOwnBar = isFloatingRef.current && (
                moveEvent.clientY >= listRect.top - 20 &&
                moveEvent.clientY <= listRect.bottom + 45 &&
                moveEvent.clientX >= listRect.left - 40 &&
                moveEvent.clientX <= listRect.right + 40
            );
            setIsNearOwnTabBar(isNearOwnBar);

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

            // Set transform so visual position matches visualLeft 1:1 strictly within the tab bar.
            // Do NOT update while floating: tab is invisible and managed by ghost window.
            if (!isFloatingRef.current) {
                setDragTranslate(visualLeft - naturalLeft);
            } else {
                return;
            }


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

            // Trigger finish_tab_drag if:
            //  1. Dragging outside own tab bar (vertical or horizontal), OR
            //  2. Tab is floating (pulled out of tab bar) — Rust backend handles hit detection
            //     against all other windows, so we always delegate to it.
            const isFarAway = upEvent.clientY < listRect.top - 20 || upEvent.clientY > listRect.bottom + 35
                || upEvent.clientX < listRect.left - 25 || upEvent.clientX > listRect.right + 25;
            if (isDragging && (isFarAway || isFloatingRef.current)) {
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
                        // Clear placeholder AFTER import-tab has been processed by target window
                        emit('highlight-drop-target', { targetWindow: null });
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
                        setIsWindowDimmed(false);
                        setIsNearOwnTabBar(false);
                    }).catch((err) => {
                        emit('highlight-drop-target', { targetWindow: null });
                        console.error(err);
                        setDraggedId(null);
                        setDragTranslate(0);
                        setIsFloating(false);
                        setIsWindowDimmed(false);
                        setIsNearOwnTabBar(false);
                    });
                    return;
                }
            }

            emit('highlight-drop-target', { targetWindow: null });
            setDraggedId(null);
            setDragTranslate(0);
            setIsFloating(false);
            setIsWindowDimmed(false);
            setIsNearOwnTabBar(false);
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

    const executeClose = (idToClose: string) => {
        const currentTabs = useEditorStore.getState().tabs;
        const { reduceMotion } = useSettingsStore.getState();
        if (currentTabs.length <= 1 || reduceMotion) {
            closeTab(idToClose);
            return;
        }
        setClosingTabIds(prev => new Set(prev).add(idToClose));
        setTimeout(() => {
            closeTab(idToClose);
            setClosingTabIds(prev => {
                const next = new Set(prev);
                next.delete(idToClose);
                return next;
            });
        }, 150);
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
                    executeClose(id);
                }
            } else if (action === 'dont_save') {
                executeClose(id);
            }
        } else {
            executeClose(id);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (tabBarRef.current && e.deltaY !== 0 && e.deltaX === 0) {
            tabBarRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div
            className={`tab-bar ${draggedId ? 'is-dragging-any' : ''} ${scrollState.canScrollLeft ? 'can-scroll-left' : ''} ${scrollState.canScrollRight ? 'can-scroll-right' : ''}`}
            onPointerDown={(e) => {
                // If user clicks on empty space in the tab bar (not on a tab, button, or other interactive element),
                // start native window drag via JS. This avoids data-tauri-drag-region which breaks acceptFirstMouse.
                const target = e.target as HTMLElement;
                const isInteractive = target.closest('.tab, .tab-add, button, [data-no-drag]');
                if (!isInteractive && e.button === 0) {
                    getCurrentWindow().startDragging().catch(() => {});
                }
            }}
        >
            <div
                className={`tab-list ${isCrossDropTarget ? 'is-cross-drop-target' : ''}`}
                ref={tabBarRef}
                onWheel={handleWheel}
            >
                {(() => {
                    let targetTabWidth = 160;
                    for (const el of tabElementsRef.current.values()) {
                        if (el) {
                            const w = el.getBoundingClientRect().width;
                            if (w > 0) {
                                targetTabWidth = w;
                                break;
                            }
                        }
                    }

                    return (
                        <>
                            {tabs.map((tab, index) => {
                                const isDragging = tab.id === draggedId;
                                const isJustImported = tab.id === justImportedId;
                                const isNewlyAdded = tab.id === newlyAddedId;
                                const isClosing = closingTabIds.has(tab.id);
                                const isOwnPlaceholder = isDragging && isFloating && isNearOwnTabBar;
                                const isFloatingCollapsed = isDragging && isFloating && !isNearOwnTabBar;
                                const style: React.CSSProperties = isDragging
                                    ? isFloating
                                        ? {
                                            transform: 'translateX(0)',
                                            zIndex: 10,
                                            pointerEvents: 'none',
                                        }
                                        : {
                                            transform: `translateX(${dragTranslate}px) scale(1)`,
                                            zIndex: 100,
                                            transition: 'none',
                                            opacity: 0.96,
                                            pointerEvents: 'auto',
                                        }
                                    : { transform: 'translateX(0)', transition: 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)' };

                                const showPlaceholderBefore = isCrossDropTarget && crossDropIndex === index;

                                return (
                                    <React.Fragment key={tab.id}>
                                        {showPlaceholderBefore && (
                                            <div
                                                key={`__cross_placeholder_before_${tab.id}__`}
                                                className="tab tab-drop-placeholder"
                                                style={{ '--target-tab-width': `${targetTabWidth}px` } as React.CSSProperties}
                                            />
                                        )}
                                        <div
                                            ref={(el) => {
                                                if (el) tabElementsRef.current.set(tab.id, el);
                                                else tabElementsRef.current.delete(tab.id);
                                            }}
                                            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${isDragging ? 'is-dragging' : ''} ${isOwnPlaceholder ? 'is-own-drop-placeholder' : ''} ${isFloatingCollapsed ? 'is-floating-collapsed' : ''} ${isJustImported ? 'is-just-imported' : ''} ${isNewlyAdded ? 'is-newly-added' : ''} ${isClosing ? 'is-closing' : ''}`}
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
                                    </React.Fragment>
                                );
                            })}
                            {/* Cross-window drop placeholder at the end of the list */}
                            {isCrossDropTarget && (crossDropIndex === null || crossDropIndex >= tabs.length) && (
                                <div
                                    key="__cross_placeholder_end__"
                                    className="tab tab-drop-placeholder"
                                    style={{ '--target-tab-width': `${targetTabWidth}px` } as React.CSSProperties}
                                />
                            )}
                        </>
                    );
                })()}
            </div>

            {/* Add-button group — outside tab-list so it doesn't scroll.
                The fade div is absolutely positioned to overlap the right edge of tab-list. */}
            <div className={`tab-add-group${scrollState.canScrollRight ? ' show-fade' : ''}`}>
                <button className="tab-add" onClick={() => addTab()} title="New Tab">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>

            {/* Spacer between (+) and settings button for window drag */}
            <div className="tab-drag-spacer" />

            {/* Actions container */}
            <div className="tab-actions">
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
