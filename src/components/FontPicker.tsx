import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FontPicker.css';

export interface FontOption {
    label: string;
    value: string;
    group: string;
}

interface Props {
    value: string;
    options: FontOption[];
    onChange: (value: string) => void;
}

/**
 * Searchable font list.
 *
 * Replaces a <select>, for two reasons: a native popup listing 200 families is
 * unusable, and a select is as wide as its longest option, so one long font
 * name stretched the control and wrapped the settings row.
 */
export const FontPicker: React.FC<Props> = ({ value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [anchor, setAnchor] = useState<
        { top: number; left: number; width: number; height: number } | null
    >(null);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const current = options.find((option) => option.value === value);
    const label = current?.label ?? value.replace(/"/g, '').split(',')[0];

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return options;
        return options.filter((option) => option.label.toLowerCase().includes(needle));
    }, [options, query]);

    // Fixed positioning plus a portal to <body>. The settings sheet scrolls and
    // clips, and more importantly its backdrop-filter makes it the containing
    // block for position:fixed children -- so coordinates measured against the
    // viewport land in the wrong place unless the panel escapes it entirely.
    useLayoutEffect(() => {
        if (!isOpen || !buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const margin = 12;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        const width = Math.min(Math.max(rect.width, 240), Math.max(200, viewportW - margin * 2));
        const spaceBelow = viewportH - rect.bottom;
        const openUpwards = spaceBelow < 200 && rect.top > spaceBelow;
        const room = openUpwards ? rect.top : spaceBelow;
        const height = Math.max(160, Math.min(300, room - margin - 6));

        // Right-aligned to the trigger, but clamped into the viewport: the
        // panel is wider than the trigger, so without this it runs off the
        // left edge whenever the trigger sits near it.
        const left = Math.max(
            margin,
            Math.min(rect.right - width, viewportW - width - margin)
        );
        const top = Math.max(
            margin,
            Math.min(openUpwards ? rect.top - height - 6 : rect.bottom + 6, viewportH - height - margin)
        );

        setAnchor({ top, left, width, height });
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        window.addEventListener('pointerdown', onPointerDown);
        return () => window.removeEventListener('pointerdown', onPointerDown);
    }, [isOpen]);

    // Keep the highlighted row in view while arrowing through a long list.
    useEffect(() => {
        if (!isOpen) return;
        listRef.current
            ?.querySelector('.font-option.is-active')
            ?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, isOpen]);

    const commit = (option: FontOption) => {
        onChange(option.value);
        setIsOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const option = matches[activeIndex];
            if (option) commit(option);
        }
    };

    const open = () => {
        setQuery('');
        setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
        setIsOpen(true);
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={`font-picker-trigger ${isOpen ? 'is-open' : ''}`}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="font-picker-value">{label}</span>
                <span className="font-picker-stepper" aria-hidden="true" />
            </button>

            {isOpen && anchor && createPortal(
                <div
                    ref={panelRef}
                    className="font-panel"
                    style={{
                        top: anchor.top,
                        left: anchor.left,
                        width: anchor.width,
                        maxHeight: anchor.height,
                    }}
                    role="listbox"
                >
                    <input
                        className="font-search"
                        placeholder="Search fonts"
                        value={query}
                        autoFocus
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={onKeyDown}
                    />

                    <div className="font-list" ref={listRef}>
                        {matches.length === 0 && <div className="font-empty">No fonts match</div>}
                        {matches.map((option, index) => (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={option.value === value}
                                className={`font-option ${index === activeIndex ? 'is-active' : ''} ${
                                    option.value === value ? 'is-selected' : ''
                                }`}
                                onPointerEnter={() => setActiveIndex(index)}
                                onClick={() => commit(option)}
                            >
                                <span className="font-option-check" aria-hidden="true">
                                    {option.value === value ? '✓' : ''}
                                </span>
                                {/* Shown in its own face, so you can see what you're picking. */}
                                <span className="font-option-name" style={{ fontFamily: option.value }}>
                                    {option.label}
                                </span>
                                <span className="font-option-group">{option.group}</span>
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
