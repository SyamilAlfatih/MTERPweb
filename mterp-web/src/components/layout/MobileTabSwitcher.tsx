import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Pin,
} from 'lucide-react';
import { useTabs } from '../../contexts/TabsContext';
import { useCommandPalette } from '../../contexts/CommandPaletteContext';
import { getRouteMetadata } from '../../routes/appRoutes';

export default function MobileTabSwitcher() {
  const { tabs, activeTabId, switchTab, closeTab, closeOtherTabs } = useTabs();
  const { open: openCommandPalette } = useCommandPalette();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Prevent background scrolling when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Mobile Tab Trigger Button (Visible on mobile/tablet) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex md:hidden items-center justify-center w-10 h-10 rounded-xl bg-bg-secondary border border-border-light text-text-muted hover:text-primary transition-all cursor-pointer active:scale-95 relative shrink-0"
        title={t('tabs.switcherTitle', 'Daftar Tab Terbuka')}
        aria-label={t('tabs.switcherTitle', 'Daftar Tab Terbuka')}
      >
        <Layers size={18} className="text-primary" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center leading-none shadow-xs">
          {tabs.length}
        </span>
      </button>

      {/* Mobile Bottom Sheet Drawer rendered into document.body to break out of stacking context */}
      {isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('tabs.switcherTitle', 'Daftar Tab Terbuka')}
            className="fixed inset-0 z-[10000] flex flex-col justify-end md:hidden"
          >
            {/* Full-screen Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-up Drawer Sheet */}
            <div
              className="relative w-full max-h-[85dvh] bg-bg-white rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.25)] border-t border-border-light flex flex-col z-10 transition-transform duration-250 overflow-hidden"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-12 h-1.5 bg-border-light rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border-light bg-bg-secondary/30 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-2xs">
                    <Layers size={17} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-text-primary leading-tight">
                      {t('tabs.switcherTitle', 'Daftar Tab Terbuka')}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium leading-tight">
                      {tabs.length} / 10 {t('tabs.activeTabsCount', 'tab aktif')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tab Cards List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  const { icon: RouteIcon } = getRouteMetadata(tab.path);

                  return (
                    <div
                      key={tab.id}
                      onClick={() => {
                        switchTab(tab.id);
                        setIsOpen(false);
                      }}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer active:scale-98 ${
                        isActive
                          ? 'bg-primary/[0.08] border-primary shadow-xs ring-1 ring-primary/30'
                          : 'bg-bg-white hover:bg-bg-secondary/60 border-border-light'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-primary text-white shadow-2xs'
                            : 'bg-bg-secondary text-text-secondary border border-border-light'
                        }`}
                      >
                        <RouteIcon size={18} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-bold truncate ${
                              isActive ? 'text-primary' : 'text-text-primary'
                            }`}
                          >
                            {tab.title}
                          </span>
                          {tab.pinned && (
                            <Pin size={12} className="text-amber-500 fill-amber-500 shrink-0" />
                          )}
                          {tab.dirty && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" title="Unsaved" />
                          )}
                        </div>
                        <span className="text-xs text-text-muted truncate block mt-0.5">
                          {tab.path}
                        </span>
                      </div>

                      {/* Status chip or close button */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isActive && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg mr-1">
                            <CheckCircle2 size={13} />
                            <span>Aktif</span>
                          </span>
                        )}

                        {!tab.pinned && (
                          <button
                            type="button"
                            onClick={() => closeTab(tab.id)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            title={t('tabs.close', 'Tutup')}
                            aria-label={t('tabs.close', 'Tutup')}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-border-light bg-bg-secondary/40 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    openCommandPalette();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-white font-bold text-xs shadow-sm hover:opacity-95 transition-opacity cursor-pointer active:scale-98"
                >
                  <Plus size={16} />
                  <span>{t('tabs.newTab', 'Buka Tab Baru (+)')}</span>
                </button>

                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      closeOtherTabs(activeTabId);
                    }}
                    className="flex items-center justify-center gap-1.5 py-3 px-3.5 rounded-xl bg-bg-white border border-border-light text-text-secondary hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-semibold text-xs transition-colors cursor-pointer active:scale-98 shadow-2xs"
                    title={t('tabs.closeOthers', 'Tutup Tab Lainnya')}
                  >
                    <Trash2 size={14} />
                    <span>{t('tabs.closeOthersShort', 'Tutup Lainnya')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
