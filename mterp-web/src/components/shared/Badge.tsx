import React from 'react';

interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'small' | 'medium';
  style?: React.CSSProperties;
  className?: string;
}

export default function Badge({
  label,
  variant = 'primary',
  size = 'small',
  style,
  className = '',
}: BadgeProps) {
  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs',
    medium: 'px-2.5 py-1 text-sm'
  };

  const variantClasses = {
    primary: 'bg-semantic-info-bg text-semantic-info border-semantic-info',
    success: 'bg-semantic-success-bg text-[#166534] border-semantic-success',
    warning: 'bg-semantic-warning-bg text-[#B45309] border-semantic-warning',
    danger: 'bg-semantic-danger-bg text-[#DC2626] border-semantic-danger',
    neutral: 'bg-bg-secondary text-text-secondary border-border',
  };

  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-[0.5px] rounded border border-transparent ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}
