'use client';

import type { ReactNode } from 'react';

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
        id="injpass-primary-sidebar"
        aria-label="Primary navigation"
        aria-modal={open ? true : undefined}
        role={open ? 'dialog' : undefined}
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
