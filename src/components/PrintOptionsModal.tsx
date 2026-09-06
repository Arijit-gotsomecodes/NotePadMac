import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { usePrintStore, useSystemPrint, type PrintHeading } from '../hooks/usePrint';
import './PrintOptionsModal.css';

export const PrintOptionsModal: React.FC = () => {
    const { isOpen, heading, close, setHeading } = usePrintStore();
    const tabs = useEditorStore((s) => s.tabs);
    const activeTabId = useEditorStore((s) => s.activeTabId);
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const systemPrint = useSystemPrint();

    // Set once the choice is committed, so the heading is in the DOM before the
    // print operation snapshots the page.
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (!pending) return;
        // The effect runs after commit; one frame more guarantees a paint, so
        // NSPrintOperation captures the heading we just chose rather than the
        // previous one.
        const frame = requestAnimationFrame(() => {
            void systemPrint();
            setPending(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [pending, systemPrint]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter') {
                e.preventDefault();
                close();
                setPending(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, close]);

    if (!isOpen || !activeTab) return null;

    const options: { value: PrintHeading; label: string; hint: string; sample: string }[] = [
        {
            value: 'none',
            label: 'Text only',
            hint: 'No heading, just the contents',
            sample: 'None',
        },
        {
            value: 'filename',
            label: 'With file name',
            hint: 'Name at the top, then the text',
            sample: activeTab.title,
        },
    ];

    return (
        <div className="print-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className="print-modal" role="dialog" aria-modal="true" aria-label="Print options">
                <div className="print-modal-header">
                    <h3>Print</h3>
                    <p>Choose the heading for the printed page.</p>
                </div>

                <div className="print-choices">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={heading === option.value}
                            className={`print-choice ${heading === option.value ? 'is-selected' : ''}`}
                            onClick={() => setHeading(option.value)}
                        >
                            <span className="print-choice-radio" />
                            <span className="print-choice-text">
                                <span className="print-choice-label">{option.label}</span>
                                <span className="print-choice-hint">{option.hint}</span>
                            </span>
                            {/* What the heading will actually be. */}
                            <span
                                className={`print-choice-sample ${option.value === 'none' ? 'is-empty' : ''}`}
                            >
                                {option.sample}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="print-modal-footer">
                    <button className="btn-secondary" onClick={close}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={() => {
                            close();
                            setPending(true);
                        }}
                    >
                        Print...
                    </button>
                </div>
            </div>
        </div>
    );
};
