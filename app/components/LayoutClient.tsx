'use client';

import { usePathname } from 'next/navigation';
import TunnelBackground from '@/components/TunnelBackground';
import { useTheme } from '@/contexts/ThemeContext';

export function SidebarOverlay() {
  const handleClick = () => {
    document.body.classList.toggle('sidebar-mode');
  };

  return <div className="sidebar-overlay" onClick={handleClick}></div>;
}

export function GeometricShapes() {
  const pathname = usePathname();
  const { theme } = useTheme();

  if (pathname === '/' || pathname === '/welcome' || pathname === '/dashboard') {
    return null;
  }

  return (
    <>
      <TunnelBackground mode={theme} className="fixed inset-0 -z-10" />
      <div
        className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          background:
            theme === 'light'
              ? 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(237,241,247,0.3) 100%)'
              : 'linear-gradient(180deg, rgba(2,2,2,0.08) 0%, rgba(2,2,2,0.18) 100%)',
        }}
      />
    </>
  );
}
