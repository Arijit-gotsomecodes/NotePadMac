import React, { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { saveTab } from '../hooks/useFileOperations';
import './Editor.css';

export const Editor: React.FC = () => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const {
        tabs,
        activeTabId,
        updateContent,
        updateCursor,
        updateScrollTop,
        pushUndo,
    } = useEditorStore();
    const { wordWrap, zoom, fontFamily, fontSize, autoSave } = useSettingsStore();

    const activeTab = tabs.find((t) => t.id === activeTabId);

    const updateCursorPosition = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea || !activeTab) return;

        const value = textarea.value;
        const selStart = textarea.selectionStart;
        const textBefore = value.substring(0, selStart);
        const lines = textBefore.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        updateCursor(activeTab.id, line, col);
    }, [activeTab?.id, updateCursor]);

    // Sync textarea value with store content (for undo/redo and tab switches)
    useEffect(() => {
        if (textareaRef.current && activeTab) {
            // Only update if values differ (to preserve cursor position during typing)
            if (textareaRef.current.value !== activeTab.content) {
                const scrollPos = textareaRef.current.scrollTop;
                textareaRef.current.value = activeTab.content;
                textareaRef.current.scrollTop = scrollPos;
            }
        }
    }, [activeTab?.content]);

    // Focus and restore scroll on tab switch
    useEffect(() => {
        if (textareaRef.current && activeTab) {
            textareaRef.current.value = activeTab.content;
            textareaRef.current.scrollTop = activeTab.scrollTop;
            textareaRef.current.focus();
            updateCursorPosition();
        }
    }, [activeTabId]);

    // Auto-save debounced (1000ms after user stops typing) for tabs with an existing filePath
    useEffect(() => {
        if (!autoSave || !activeTab?.filePath || !activeTab.isDirty) {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            return;
        }

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            saveTab(activeTab.id);
        }, 1000);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [activeTab?.content, activeTab?.filePath, activeTab?.isDirty, autoSave, activeTab?.id]);

    // Auto-save immediately when window loses focus (blur)
    useEffect(() => {
        const handleWindowBlur = () => {
            const currentTab = useEditorStore.getState().getActiveTab();
            const { autoSave: isAutoSave } = useSettingsStore.getState();
            if (isAutoSave && currentTab?.filePath && currentTab.isDirty) {
                saveTab(currentTab.id);
            }
        };
        window.addEventListener('blur', handleWindowBlur);
        return () => window.removeEventListener('blur', handleWindowBlur);
    }, []);

    const handleInput = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            if (!activeTab) return;
            updateContent(activeTab.id, e.target.value);
            updateCursorPosition();
        },
        [activeTab?.id, updateContent, updateCursorPosition]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (!activeTab) return;
            // Push undo state before typing starts (on keydown that modifies content)
            if (
                !e.metaKey &&
                !e.ctrlKey &&
                e.key.length === 1
            ) {
                pushUndo(activeTab.id, activeTab.content);
            }
            // Also push undo for backspace/delete
            if (e.key === 'Backspace' || e.key === 'Delete') {
                pushUndo(activeTab.id, activeTab.content);
            }
            // Handle Tab key for indentation
            if (e.key === 'Tab') {
                e.preventDefault();
                pushUndo(activeTab.id, activeTab.content);
                const textarea = textareaRef.current;
                if (!textarea) return;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                const newValue = value.substring(0, start) + '\t' + value.substring(end);
                textarea.value = newValue;
                textarea.selectionStart = textarea.selectionEnd = start + 1;
                updateContent(activeTab.id, newValue);
            }
        },
        [activeTab?.id, activeTab?.content, pushUndo, updateContent]
    );

    const handleScroll = useCallback(() => {
        if (textareaRef.current && activeTab) {
            updateScrollTop(activeTab.id, textareaRef.current.scrollTop);
        }
    }, [activeTab?.id, updateScrollTop]);

    const handleClick = useCallback(() => {
        updateCursorPosition();
    }, [updateCursorPosition]);

    const handleKeyUp = useCallback(() => {
        updateCursorPosition();
    }, [updateCursorPosition]);

    if (!activeTab) {
        return <div className="editor-empty">No tabs open</div>;
    }

    const scaledFontSize = (fontSize * zoom) / 100;

    return (
        <div className="editor-container">
            <textarea
                ref={textareaRef}
                className="editor-textarea"
                defaultValue={activeTab.content}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onClick={handleClick}
                onScroll={handleScroll}
                spellCheck={false}
                style={{
                    fontFamily,
                    fontSize: `${scaledFontSize}px`,
                    whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                    overflowWrap: wordWrap ? 'break-word' : 'normal',
                    wordBreak: 'normal',
                }}
            />
        </div>
    );
};
