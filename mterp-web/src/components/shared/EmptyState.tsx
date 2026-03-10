import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center opacity-70">
      <Icon size={64} className="text-border mb-4" />
      <h3 className="text-lg font-bold text-text-secondary m-0 mb-2">{title}</h3>
      {description && <p className="text-base text-text-muted m-0">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
