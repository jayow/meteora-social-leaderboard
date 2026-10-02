"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared modal look (Jay's rule: fully opaque, no see-through backdrops or panels).
 * Exported so modals that manage their own markup stay consistent with <Modal>.
 */
export const MODAL_BACKDROP = "fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-bg p-4";
export const MODAL_PANEL = "relative w-full rounded-card border border-border bg-surface outline-none";

// Open modals, innermost last: only the top one reacts to Escape.
const stack: symbol[] = [];
let lockedOverflow: string | null = null;

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Extra panel classes (width, padding, layout). */
  className?: string;
  labelledBy?: string;
  label?: string;
  testId?: string;
}

/**
 * Portaled to <body> so no ancestor (e.g. a card with a transform or z-index stacking
 * context) can trap or overlap it. Escape and a click on the backdrop both close it.
 */
export function Modal({ onClose, children, className = "", labelledBy, label, testId }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const id = Symbol("modal");
    stack.push(id);
    if (stack.length === 1) {
      lockedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) {
        document.body.style.overflow = lockedOverflow ?? "";
        lockedOverflow = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mounted) panelRef.current?.focus();
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={MODAL_BACKDROP}
      data-modal-backdrop=""
      // Close only when the press both starts and ends on the backdrop (a drag out of a text field doesn't close).
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        data-testid={testId}
        className={`${MODAL_PANEL} m-auto ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/** The one close control for every modal: a quiet icon button, top right of the panel or header. */
export function ModalClose({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-mute transition hover:bg-surface-raised hover:text-fg ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}
