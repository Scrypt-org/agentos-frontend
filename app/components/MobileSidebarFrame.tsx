'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

type MobileSidebarFrameProps = {
  children: ReactNode;
  isLight: boolean;
  onClose: () => void;
  open: boolean;
};

export default function MobileSidebarFrame({
  children,
  isLight,
  onClose,
  open,
}: MobileSidebarFrameProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const sidebar = sidebarRef.current;
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () => sidebar
      ? Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null)
      : [];
    const focusFrame = window.requestAnimationFrame(() => {
      (getFocusableElements()[0] || sidebar)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        sidebar?.focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElement?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-30 transition-opacity duration-300 motion-reduce:transition-none lg:hidden ${
          open
            ? 'pointer-events-auto visible opacity-100'
            : 'pointer-events-none invisible opacity-0'
        } ${isLight ? 'bg-black/20' : 'bg-black/55'}`}
      />
      <aside
        ref={sidebarRef}
        id="injpass-primary-sidebar"
        aria-label="Primary navigation"
        aria-modal={open ? true : undefined}
        role={open ? 'dialog' : undefined}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(86vw,320px)] shrink-0 transform-gpu transition-transform duration-300 motion-reduce:transition-none lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${
          open
            ? 'visible translate-x-0'
            : 'invisible -translate-x-full lg:visible'
        }`}
      >
        {children}
      </aside>
    </>
  );
}
