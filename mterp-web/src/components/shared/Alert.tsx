import React from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface AlertProps {
  visible: boolean;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  onClose: () => void;
}

export default function Alert({
  visible,
  type,
  title,
  message,
  onClose,
}: AlertProps) {
  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={48} className="mb-4 inline-block text-semantic-success" />;
      case 'error':
        return <AlertCircle size={48} className="mb-4 inline-block text-semantic-danger" />;
      default:
        return <Info size={48} className="mb-4 inline-block text-semantic-info" />;
    }
  };

  const getButtonBg = () => {
    switch (type) {
      case 'success': return 'bg-semantic-success';
      case 'error': return 'bg-semantic-danger';
      default: return 'bg-primary';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] animate-fade-in p-4" onClick={onClose}>
      <div className="bg-bg-white rounded-[16px] p-8 max-w-[360px] w-full text-center relative shadow-hypr" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-4 right-4 text-text-muted cursor-pointer transition-colors hover:text-text-primary" onClick={onClose}>
          <X size={24} />
        </button>
        {getIcon()}
        <h3 className="text-xl font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-base text-text-secondary mb-6 leading-relaxed">{message}</p>
        <button className={`w-full p-4 rounded-md text-base font-bold text-white cursor-pointer transition-opacity hover:opacity-90 ${getButtonBg()}`} onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
