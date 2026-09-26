import React, { useState, useEffect, useRef, useId } from 'react';
import { LucideIcon } from 'lucide-react';

export interface CostInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  error?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  prefix?: string;
  align?: 'left' | 'right';
  compact?: boolean;
  name?: string;
  id?: string;
}

/**
 * Format a number with Indonesian dot thousand separators (e.g. 1000000 -> "1.000.000")
 */
export function formatRupiahDots(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === '') return '';
  const n = typeof num === 'string' ? Number(num.replace(/\./g, '')) : Number(num);
  if (isNaN(n)) return '';
  return new Intl.NumberFormat('id-ID').format(Math.round(n));
}

/**
 * Strips all dot separators and non-digit characters to obtain the raw integer string.
 */
export function stripDots(str: string): string {
  return str.replace(/\./g, '').replace(/[^\d]/g, '').trim();
}

/**
 * ERP-standard CostInput:
 * Displays numbers formatted with dot thousand separators (e.g. 1.000.000)
 * while the underlying value emitted to onChange is always the exact raw number (e.g. 1000000).
 * Preserves the 1.000.000 formatted display during focus, typing, and blur.
 */
export default function CostInput({
  value,
  onChange,
  label,
  placeholder = '0',
  className = '',
  inputClassName = '',
  error,
  disabled = false,
  icon: Icon,
  prefix,
  align = 'right',
  compact = false,
  name,
  id: customId,
}: CostInputProps) {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);

  // Maintain the formatted text display
  const [displayValue, setDisplayValue] = useState<string>(() => {
    return value || value === 0 ? (value === 0 ? '' : formatRupiahDots(value)) : '';
  });

  // Keep internal display synced with external value changes (e.g. form reset or programmatic updates)
  useEffect(() => {
    const currentNum = displayValue ? Number(stripDots(displayValue)) : 0;
    if (value !== currentNum) {
      setDisplayValue(value || value === 0 ? (value === 0 ? '' : formatRupiahDots(value)) : '');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawVal = input.value;
    const cursor = input.selectionStart || 0;

    // Count non-dot digits before cursor
    const digitsBeforeCursor = stripDots(rawVal.slice(0, cursor)).length;

    // Strip dots to get pure number
    const cleanDigits = stripDots(rawVal);

    if (cleanDigits === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    const numericValue = Number(cleanDigits);
    const formatted = formatRupiahDots(numericValue);

    setDisplayValue(formatted);
    onChange(numericValue);

    // Reposition cursor accurately after dot formatting
    requestAnimationFrame(() => {
      if (inputRef.current) {
        let newPos = 0;
        let counted = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i] !== '.') counted++;
          newPos = i + 1;
          if (counted >= digitsBeforeCursor) break;
        }
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Keep dots intact! If value is 0 and empty, user can just type
    if (!displayValue && value) {
      setDisplayValue(formatRupiahDots(value));
    }
  };

  const handleBlur = () => {
    if (!displayValue && value) {
      setDisplayValue(formatRupiahDots(value));
    }
  };

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-text-primary">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <Icon
            size={compact ? 14 : 18}
            className={`absolute left-2.5 text-text-muted select-none pointer-events-none`}
          />
        )}
        {prefix && !Icon && (
          <span
            className={`absolute left-2.5 text-text-muted text-xs font-semibold select-none pointer-events-none`}
          >
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          className={`w-full font-mono tabular-nums border outline-none transition-all ${
            align === 'right' ? 'text-right' : 'text-left'
          } ${
            compact
              ? `py-1 ${Icon || prefix ? 'pl-8' : 'px-2'} pr-2 text-xs rounded-lg h-8`
              : `py-2 ${Icon || prefix ? 'pl-9 pr-3' : 'px-3'} text-sm rounded-lg h-10`
          } ${
            error
              ? 'border-red-500 ring-1 ring-red-500/20'
              : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/10'
          } bg-bg-primary text-text-primary placeholder:text-text-muted disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-bg-secondary ${inputClassName}`}
          value={displayValue}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
        />
      </div>
      {error && <span className="text-[11px] text-red-500 font-medium">{error}</span>}
    </div>
  );
}
