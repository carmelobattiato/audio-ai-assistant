import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

function mountDialog() {
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <div id="dialog">
      <button id="a">a</button>
      <button id="b">b</button>
      <button id="c">c</button>
    </div>`;
  return document.getElementById('dialog') as HTMLDivElement;
}

const press = (el: Element | null, init: KeyboardEventInit) =>
  el?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; });

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', () => {
    const dialog = mountDialog();
    const { rerender } = renderHook(
      ({ active }) => {
        const ref = useFocusTrap<HTMLDivElement>(active);
        (ref as { current: HTMLDivElement | null }).current = dialog;
        return ref;
      },
      { initialProps: { active: false } },
    );
    rerender({ active: true });
    expect(document.activeElement).toBe(document.getElementById('a'));
  });

  it('wraps Tab from last to first and Shift+Tab from first to last', () => {
    const dialog = mountDialog();
    const onEscape = vi.fn();
    // Manually drive the hook logic by attaching ref before the effect runs.
    const { rerender } = renderHook(
      ({ active }) => {
        const ref = useFocusTrap<HTMLDivElement>(active, onEscape);
        (ref as { current: HTMLDivElement | null }).current = dialog;
        return ref;
      },
      { initialProps: { active: false } },
    );
    rerender({ active: true });

    const a = document.getElementById('a')!;
    const c = document.getElementById('c')!;

    c.focus();
    press(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(a);

    a.focus();
    press(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(c);
  });

  it('calls onEscape on Escape key', () => {
    const dialog = mountDialog();
    const onEscape = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => {
        const ref = useFocusTrap<HTMLDivElement>(active, onEscape);
        (ref as { current: HTMLDivElement | null }).current = dialog;
        return ref;
      },
      { initialProps: { active: false } },
    );
    rerender({ active: true });
    press(dialog, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
