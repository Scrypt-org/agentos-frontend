export const MINI_APP_PANEL_CLASS =
  'relative mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col overflow-hidden rounded-lg border shadow-[0_20px_70px_rgba(0,0,0,0.09)]';

export const MINI_APP_FRAME_CLASS = 'h-full min-h-0 w-full flex-1 border-0 bg-white';

export function mainContentOverflowClass(surface: string): 'overflow-hidden' | 'overflow-y-auto' {
  return surface === 'mini-app' ? 'overflow-hidden' : 'overflow-y-auto';
}
