import React from 'react';

interface AriaLiveRegionProps {
  /** The message to be announced by screen readers */
  message: string;
  /** Politeness level: 'polite' (default, waits for idle) or 'assertive' (interrupts) */
  politeness?: 'polite' | 'assertive' | 'off';
  /** Optional visual presence (default is visually hidden / screen-reader only) */
  visible?: boolean;
  className?: string;
}

/**
 * AriaLiveRegion
 * Provides WCAG 2.2 AA compliant live status updates for assistive technologies
 * (screen readers) when data tables, search filters, or asynchronous operations update.
 */
export default function AriaLiveRegion({
  message,
  politeness = 'polite',
  visible = false,
  className = '',
}: AriaLiveRegionProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={
        visible
          ? className
          : `sr-only absolute w-px h-px p-0 -m-px overflow-hidden clip-[rect(0,0,0,0)] whitespace-nowrap border-0 ${className}`
      }
    >
      {message}
    </div>
  );
}
