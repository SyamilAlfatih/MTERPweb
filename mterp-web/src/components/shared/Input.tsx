import React, { useState } from 'react';
import { LucideIcon, Eye, EyeOff } from 'lucide-react';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText?: (text: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'password' | 'email' | 'number' | 'date';
  icon?: LucideIcon;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  style?: React.CSSProperties;
  className?: string;
}

export default function Input({
  label,
  placeholder,
  value,
  onChangeText,
  onChange,
  type = 'text',
  icon: Icon,
  error,
  disabled = false,
  maxLength,
  multiline = false,
  numberOfLines = 3,
  style,
  className = '',
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e);
    }
    if (onChangeText) {
      onChangeText(e.target.value);
    }
  };

  const inputType = type === 'password' && showPassword ? 'text' : type;

  if (multiline) {
    return (
      <div className={`mb-5 ${className}`} style={style}>
        {label && <label className="block text-sm font-bold text-text-muted uppercase tracking-[0.5px] mb-2.5">{label}</label>}
        <div className={`flex items-center gap-3 bg-bg-white border-2 rounded-lg px-4 transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 ${error ? '!border-semantic-danger' : 'border-border-light'} ${disabled ? 'bg-bg-secondary cursor-not-allowed' : ''}`}>
          {Icon && <Icon size={20} className="text-text-muted shrink-0" />}
          <textarea
            className="flex-1 border-none bg-transparent py-4 text-base text-text-primary outline-none w-full placeholder:text-text-muted disabled:cursor-not-allowed disabled:text-text-muted resize-y min-h-[80px]"
            placeholder={placeholder}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            maxLength={maxLength}
            rows={numberOfLines}
          />
        </div>
        {error && <span className="block text-sm text-semantic-danger mt-1">{error}</span>}
      </div>
    );
  }

  return (
    <div className={`mb-5 ${className}`} style={style}>
      {label && <label className="block text-sm font-bold text-text-muted uppercase tracking-[0.5px] mb-2.5">{label}</label>}
      <div className={`flex items-center gap-3 bg-bg-white border-2 rounded-lg px-4 transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 ${error ? '!border-semantic-danger' : 'border-border-light'} ${disabled ? 'bg-bg-secondary cursor-not-allowed' : ''}`}>
        {Icon && <Icon size={20} className="text-text-muted shrink-0" />}
        <input
          type={inputType}
          className="flex-1 border-none bg-transparent min-h-[52px] py-4 text-base text-text-primary outline-none w-full placeholder:text-text-muted disabled:cursor-not-allowed disabled:text-text-muted font-medium"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          maxLength={maxLength}
        />
        {type === 'password' && (
          <button
            type="button"
            className="flex items-center justify-center p-1 text-text-muted cursor-pointer transition-colors duration-200 hover:text-text-secondary"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      {error && <span className="block text-sm text-semantic-danger mt-1">{error}</span>}
    </div>
  );
}
