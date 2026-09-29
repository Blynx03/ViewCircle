import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LiveViewport } from '../components/LiveViewport';
it('tracks visual bounds as one surface and leaves accessibility page zoom intact', () => {
  const originalWidth = window.innerWidth; const originalHeight = window.innerHeight;
  const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const viewport = Object.assign(new EventTarget(), { width:390, height:844, offsetLeft:0, offsetTop:0, scale:1 });
  const remove = vi.spyOn(viewport, 'removeEventListener');
  Object.defineProperty(window,'innerWidth',{ configurable:true, value:390 });
  Object.defineProperty(window,'innerHeight',{ configurable:true, value:844 });
  Object.defineProperty(window,'visualViewport',{ configurable:true, value:viewport });
  try {
    const view = render(<LiveViewport className="live-page">Live</LiveViewport>); const main = screen.getByRole('main');
    expect(main.style.getPropertyValue('--live-width')).toBe('');
    act(() => { Object.assign(viewport,{ height:480, offsetLeft:8, offsetTop:12, width:374 }); viewport.dispatchEvent(new Event('resize')); });
    expect(main.style.getPropertyValue('--live-left')).toBe('8px'); expect(main.style.getPropertyValue('--live-height')).toBe('480px');
    act(() => { viewport.scale=2; viewport.dispatchEvent(new Event('resize')); });
    expect(main.style.getPropertyValue('--live-width')).toBe('');
    view.unmount(); expect(remove).toHaveBeenCalledTimes(2);
  } finally { Object.defineProperty(window,'innerWidth',{ configurable:true, value:originalWidth }); Object.defineProperty(window,'innerHeight',{ configurable:true, value:originalHeight }); if (original) Object.defineProperty(window,'visualViewport',original); else Reflect.deleteProperty(window,'visualViewport'); }
});
