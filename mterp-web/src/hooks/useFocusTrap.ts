import { useEffect, useRef, RefObject } from 'react';

interface UseFocusTrapOptions {
  isActive: boolean;
  onEscape?: () => void;
  autoFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * useFocusTrap
 * Traps Tab keyboard focus within a modal dialog and restores focus upon dismissal.
 * Conforms to WCAG 2.2 AA / WAI-ARIA Dialog (Modal) pattern.
 *
 * CRITICAL STABILITY GUARANTEE:
 * - `onEscape` is stored in a ref so inline handler re-creations during parent re-renders
 *   (e.g., typing in form inputs) never trigger effect cleanups or steal focus.
 * - Focus is captured ONCE on modal open and restored ONCE on modal close.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  containerRef: RefObject<T | null>,
  options: UseFocusTrapOptions
) {
  const { isActive, onEscape, autoFocus = true } = options;

  // Keep latest onEscape callback in a ref to avoid effect churn on parent re-renders
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Track the element focused before the modal was opened
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef(false);

  // Focus preservation and initial auto-focus: strictly triggers on isActive transition
  useEffect(() => {
    if (isActive) {
      if (!wasActiveRef.current) {
        // Modal just opened: save currently focused element
        previousFocusRef.current = (document.activeElement as HTMLElement) || null;
        wasActiveRef.current = true;

        if (autoFocus) {
          // Delay focus slightly to ensure DOM has rendered
          const timer = setTimeout(() => {
            const container = containerRef.current;
            if (!container) return;

            // Only auto-focus if focus is not already within container
            if (!container.contains(document.activeElement)) {
              const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
              const firstFocusable = Array.from(focusableElements).find(
                (el) => el.offsetParent !== null && !el.hasAttribute('disabled')
              );
              firstFocusable?.focus();
            }
          }, 30);

          return () => clearTimeout(timer);
        }
      }
    } else {
      if (wasActiveRef.current) {
        // Modal just closed: restore focus to triggering element
        wasActiveRef.current = false;
        const prev = previousFocusRef.current;
        if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
          prev.focus();
        }
      }
    }
  }, [isActive, containerRef, autoFocus]);

  // Clean up on component unmount if modal was active
  useEffect(() => {
    return () => {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        const prev = previousFocusRef.current;
        if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
          prev.focus();
        }
      }
    };
  }, []);

  // Keyboard navigation: Escape key to dismiss and Tab trapping
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === 'Escape') {
        if (onEscapeRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'));

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element or outside, cycle to last
          if (document.activeElement === firstElement || !container.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element or outside, cycle to first
          if (document.activeElement === lastElement || !container.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, containerRef]);
}
