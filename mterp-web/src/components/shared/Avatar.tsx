import React from 'react';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'small' | 'medium' | 'large';
  style?: React.CSSProperties;
  className?: string;
}

export default function Avatar({
  name = '',
  src,
  size = 'medium',
  style,
  className = '',
}: AvatarProps) {
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-10 h-10',
    large: 'w-14 h-14'
  };

  const textClasses = {
    small: 'text-base',
    medium: 'text-base',
    large: 'text-xl'
  };

  return (
    <div className={`flex items-center justify-center rounded-md bg-primary-bg overflow-hidden shrink-0 ${sizeClasses[size]} ${className}`} style={style}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className={`font-bold text-primary ${textClasses[size]}`}>{getInitials(name)}</span>
      )}
    </div>
  );
}
