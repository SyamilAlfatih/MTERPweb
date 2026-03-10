import React from 'react';
import { LucideIcon } from 'lucide-react';

interface IconButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
  variant?: 'default' | 'ghost';
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function IconButton({
  icon: Icon,
  onClick,
  size = 20,
  color = 'var(--text-primary)',
  backgroundColor = 'var(--bg-secondary)',
  variant = 'default',
  disabled = false,
  style,
  className = '',
}: IconButtonProps) {
  const hoverClass = variant === 'ghost' ? 'hover:bg-bg-secondary' : 'hover:opacity-80 hover:scale-105';
  
  return (
    <button
      type="button"
      className={`flex items-center justify-center w-10 h-10 rounded-md cursor-pointer transition-all duration-200 ${disabled ? 'opacity-50 cursor-not-allowed' : hoverClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: variant === 'ghost' ? 'transparent' : backgroundColor, ...style }}
    >
      <Icon size={size} color={color} />
    </button>
  );
}
