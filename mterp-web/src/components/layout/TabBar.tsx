import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Plus,
  Pin,
  PinOff,
  Copy,
  Trash2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTabs, Tab } from '../../contexts/TabsContext';
import { useCommandPalette } from '../../contexts/CommandPaletteContext';
import { getRouteMetadata } from '../../routes/appRoutes';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tab: Tab | null;
}

export default function TabBar() {
  const {
    tabs,
    activeTabId,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    reorderTabs,
    togglePinTab,
    openTab,
  } = useTabs();
  const { open: openCommandPalette } = useCommandPalette();
  const { t } = useTranslation();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    tab: null,
  });

  const draggedTabIndexRef = useRef<number | null>(null);

  // Close context menu on window click or Escape
  useEffect(() => {
    const handleWindowClick = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);

  // Global Keyboard shortcuts for tab operations:
  // Ctrl+Alt+W: Close active tab
  // Ctrl+Alt+ArrowRight: Next tab
  // Ctrl+Alt+ArrowLeft: Previous tab
  // Ctrl+Alt+T: New Tab
  useEffect(() => {
    const handleKeyShortcut = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier || !e.altKey) return;

      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        e.stopPropagation();
        closeTab(activeTabId);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIdx !== -1 && tabs.length > 1) {
          const nextIdx = (currentIdx + 1) % tabs.length;
          switchTab(tabs[nextIdx].id);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIdx !== -1 && tabs.length > 1) {
          const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
          switchTab(tabs[prevIdx].id);
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        e.stopPropagation();
        openCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyShortcut);
    return () => window.removeEventListener('keydown', handleKeyShortcut);
  }, [activeTabId, tabs, closeTab, switchTab, openCommandPalette]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const activeEl = document.getElementById(`tab-pill-${activeTabId}`);
    if (activeEl && scrollContainerRef.current) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTabId]);

  const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tab,
    });
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -200 : 200;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Drag and drop reordering
  const handleDragStart = (index: number) => {
    draggedTabIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    const startIndex = draggedTabIndexRef.current;
    if (startIndex !== null && startIndex !== dropIndex) {
      reorderTabs(startIndex, dropIndex);
    }
    draggedTabIndexRef.current = null;
  };

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, tabId: string, pinned?: boolean) => {
      // Button 1 is middle mouse click
      if (e.button === 1 && !pinned) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(tabId);
      }
    },
    [closeTab]
  );

  return (
    <div
      role="tablist"
      aria-label="Application Tabs"
      className="hidden md:flex items-center h-10 px-3 bg-[#eef2f6] dark:bg-[#0c1427] border-b border-border-light dark:border-slate-800 select-none sticky top-16 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
    >
      {/* Scroll Left Button if overflow */}
      <button
        type="button"
        onClick={() => handleScroll('left')}
        className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors mr-1 cursor-pointer shrink-0"
        title="Scroll left"
        aria-label="Scroll left"
      >
        <ChevronLeft size={14} />
      </button>

      {/* Tabs Container */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-1 overflow-x-auto overflow-y-hidden h-full flex-1 scrollbar-none scroll-smooth py-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const { icon: RouteIcon } = getRouteMetadata(tab.path);

          return (
            <div
              key={tab.id}
              id={`tab-pill-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              draggable={!tab.pinned}
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(index)}
              onClick={() => switchTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              onMouseDown={(e) => handleMiddleClick(e, tab.id, tab.pinned)}
              className={`group relative flex items-center gap-2 h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 border shrink-0 max-w-[200px] select-none ${
                isActive
                  ? 'bg-white dark:bg-slate-800 text-primary dark:text-blue-400 border-border-light/80 dark:border-slate-700 shadow-xs'
                  : 'bg-transparent text-text-muted hover:text-text-primary hover:bg-white/60 dark:hover:bg-slate-800/60 border-transparent'
              }`}
            >
              {/* Active Slide Indicator */}
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-[2px] bg-primary rounded-full" />
              )}

              {/* Pin or Route Icon */}
              {tab.pinned ? (
                <Pin size={12} className="text-amber-500 fill-amber-500 shrink-0" />
              ) : (
                <RouteIcon
                  size={14}
                  className={`shrink-0 transition-colors ${
                    isActive ? 'text-primary dark:text-blue-400' : 'text-text-muted group-hover:text-text-primary'
                  }`}
                />
              )}

              {/* Tab Title */}
              <span className="truncate flex-1 tracking-tight">{tab.title}</span>

              {/* Unsaved Changes Indicator (Amber Dot) */}
              {tab.dirty && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse"
                  title={t('tabs.unsavedDot', 'Ada perubahan belum disimpan')}
                />
              )}

              {/* Close Button (Hidden for pinned tabs) */}
              {!tab.pinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`w-4 h-4 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40'
                      : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={t('tabs.close', 'Tutup')}
                  aria-label={t('tabs.close', 'Tutup')}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Scroll Right Button if overflow */}
      <button
        type="button"
        onClick={() => handleScroll('right')}
        className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors ml-1 cursor-pointer shrink-0"
        title="Scroll right"
        aria-label="Scroll right"
      >
        <ChevronRight size={14} />
      </button>

      {/* New Tab Button (+) -> Launches Command Palette */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-primary hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-border-light transition-all ml-1.5 cursor-pointer shadow-2xs group shrink-0"
        title={t('tabs.newTabTooltip', 'Buka tab baru (Ctrl+Alt+T atau Ctrl+K)')}
        aria-label={t('tabs.newTab', 'Buka Tab Baru')}
      >
        <Plus size={15} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Context Menu Dropdown */}
      {contextMenu.visible && contextMenu.tab && (
        <div
          role="menu"
          className="fixed z-[200] w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 220),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close this tab */}
          {!contextMenu.tab.pinned && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (contextMenu.tab) closeTab(contextMenu.tab.id);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={14} className="text-slate-400" />
              <span>{t('tabs.contextClose', 'Tutup Tab')}</span>
            </button>
          )}

          {/* Close other tabs */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (contextMenu.tab) closeOtherTabs(contextMenu.tab.id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Trash2 size={14} className="text-slate-400" />
            <span>{t('tabs.contextCloseOthers', 'Tutup Tab Lainnya')}</span>
          </button>

          {/* Close tabs to the right */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (contextMenu.tab) closeTabsToRight(contextMenu.tab.id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowRight size={14} className="text-slate-400" />
            <span>{t('tabs.contextCloseRight', 'Tutup Tab di Sebelah Kanan')}</span>
          </button>

          <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Pin / Unpin Tab */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (contextMenu.tab) togglePinTab(contextMenu.tab.id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {contextMenu.tab.pinned ? (
              <>
                <PinOff size={14} className="text-amber-500" />
                <span>{t('tabs.contextUnpin', 'Lepas Sematan (Unpin)')}</span>
              </>
            ) : (
              <>
                <Pin size={14} className="text-amber-500" />
                <span>{t('tabs.contextPin', 'Sematkan Tab (Pin)')}</span>
              </>
            )}
          </button>

          {/* Duplicate Tab in new tab */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (contextMenu.tab) {
                openTab(contextMenu.tab.path, {
                  title: `${contextMenu.tab.title} (2)`,
                });
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Copy size={14} className="text-slate-400" />
            <span>{t('tabs.contextDuplicate', 'Duplikat Tab')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
