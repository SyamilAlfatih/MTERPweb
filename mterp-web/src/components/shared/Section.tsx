import React from 'react';
import { LucideIcon, Plus } from 'lucide-react';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  style?: React.CSSProperties;
}

export default function Section({
  title,
  children,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = Plus,
  style,
}: SectionProps) {
  return (
    <section className="mb-6" style={style}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-bold text-text-primary m-0">{title}</h2>
        {actionLabel && onAction && (
          <button className="flex items-center gap-2 px-3 py-2 bg-semantic-info-bg text-semantic-info text-sm font-semibold rounded-[4px] cursor-pointer transition-colors duration-200 hover:bg-semantic-info hover:text-white" onClick={onAction}>
            <ActionIcon size={16} />
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
