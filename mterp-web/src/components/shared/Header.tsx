import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightContent?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function Header({
  title,
  subtitle,
  showBack = true,
  rightContent,
  style,
}: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between p-6 pt-8 bg-bg-white border-b border-border-light max-sm:p-4 max-sm:pt-5" style={style}>
      <div className="flex items-center gap-4 max-sm:gap-3">
        {showBack && (
          <button 
            className="flex items-center justify-center w-10 h-10 rounded-full bg-bg-secondary text-text-primary cursor-pointer transition-colors duration-200 hover:bg-border max-sm:w-9 max-sm:h-9" 
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-text-primary m-0 max-sm:text-lg">{title}</h1>
          {subtitle && <p className="text-sm text-text-secondary mt-[2px]">{subtitle}</p>}
        </div>
      </div>
      {rightContent && <div className="flex items-center gap-3">{rightContent}</div>}
    </header>
  );
}
