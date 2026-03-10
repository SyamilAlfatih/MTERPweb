import React from 'react';

interface ProgressBarProps {
  progress: number;
  label?: string;
  showLabel?: boolean;
  color?: string;
  style?: React.CSSProperties;
}

export default function ProgressBar({
  progress,
  label,
  showLabel = true,
  color = 'var(--primary)',
  style,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="mb-4" style={style}>
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-text-secondary">{label || 'Progress'}</span>
          <span className="text-sm font-bold text-text-primary">{clampedProgress}%</span>
        </div>
      )}
      <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${clampedProgress}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
