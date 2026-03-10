import React from 'react';

interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  variant?: 'outline' | 'filled';
  size?: 'small' | 'medium';
  style?: React.CSSProperties;
}

export default function Chip({
  label,
  onPress,
  selected = false,
  variant = 'outline',
  size = 'medium',
  style,
}: ChipProps) {
  const sizeClasses = {
    small: 'px-2.5 py-1 text-xs',
    medium: 'px-4 py-2 text-sm'
  };

  const outlineClasses = selected
    ? 'bg-primary border border-primary text-white'
    : 'bg-transparent border border-border text-text-secondary hover:border-primary hover:text-primary';

  const filledClasses = selected
    ? 'bg-primary border border-primary text-white'
    : 'bg-bg-secondary border border-transparent text-text-secondary hover:bg-border';

  const variantClass = variant === 'outline' ? outlineClasses : filledClasses;

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center font-semibold rounded-[4px] cursor-pointer transition-all duration-200 ${sizeClasses[size]} ${variantClass}`}
      onClick={onPress}
      style={style}
    >
      {label}
    </button>
  );
}
