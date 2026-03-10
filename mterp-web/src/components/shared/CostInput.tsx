import React, { useState } from 'react';
import { LucideIcon } from 'lucide-react';

interface CostInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  disabled?: boolean;
  icon?: LucideIcon;
}

/**
 * Cost input that displays formatted numbers with dot separators (e.g. 2.000.000)
 * but stores the raw numeric value.
 */
export default function CostInput({ 
  value, 
  onChange, 
  label, 
  placeholder = '0', 
  className = '',
  error,
  disabled = false,
  icon: Icon
}: CostInputProps) {
  const [displayValue, setDisplayValue] = useState(value ? formatWithDots(value) : '');
  const [isFocused, setIsFocused] = useState(false);

  function formatWithDots(num: number): string {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('id-ID').format(num);
  }

  function stripDots(str: string): string {
    return str.replace(/\./g, '');
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripDots(e.target.value);
    // Only allow numeric characters
    if (raw && !/^\d+$/.test(raw)) return;
    
    const numericValue = Number(raw) || 0;
    setDisplayValue(raw ? formatWithDots(numericValue) : '');
    onChange(numericValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw number without dots when focused for easier editing
    if (value) {
      setDisplayValue(String(value));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Format with dots when blurred
    setDisplayValue(value ? formatWithDots(value) : '');
  };

  // Sync external value changes
  const shown = isFocused ? displayValue : (value ? formatWithDots(value) : '');

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && <label className="text-sm font-semibold text-text-primary">{label}</label>}
      <div className="relative flex items-center">
        {Icon && <Icon size={20} className="absolute left-3.5 text-text-muted select-none" />}
        <input
          type="text"
          inputMode="numeric"
          className={`w-full py-2.5 ${Icon ? 'pl-10 pr-3.5' : 'px-3.5'} border ${error ? 'border-red-500 ring-1 ring-red-500/20' : 'border-border focus:border-primary focus:ring-3 focus:ring-primary/10'} rounded-lg text-sm bg-bg-white text-text-primary outline-none transition-all placeholder:text-text-muted disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-bg-secondary`}
          value={shown}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
        />
      </div>
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}
