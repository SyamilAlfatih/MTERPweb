import React from 'react';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function Card({ children, onClick, style, className = '' }: CardProps) {
  return (
    <div
      className={`bg-bg-white rounded-[20px] p-4 shadow-sm border border-border-light transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:-translate-y-[2px] hover:shadow-md' : ''
      } ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}
