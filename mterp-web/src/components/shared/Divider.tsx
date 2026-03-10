import React from 'react';

interface DividerProps {
  style?: React.CSSProperties;
  className?: string;
}

export default function Divider({ style, className = '' }: DividerProps) {
  return <hr className={`border-0 border-t border-border-light my-4 ${className}`} style={style} />;
}
