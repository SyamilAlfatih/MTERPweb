import { useState, useCallback, useRef } from 'react';

export interface UseDataGridKeyboardOptions {
  onActivate?: (row: number, col: number) => void;
  gridId?: string;
}

export function useDataGridKeyboard<T extends HTMLElement = HTMLTableElement>(
  rowCount: number,
  colCount: number,
  options: UseDataGridKeyboardOptions = {}
) {
  const { onActivate, gridId = 'datagrid' } = options;
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const containerRef = useRef<T | null>(null);

  const focusCellElement = useCallback(
    (row: number, col: number) => {
      const clampedRow = Math.max(0, Math.min(rowCount - 1, row));
      const clampedCol = Math.max(0, Math.min(colCount - 1, col));
      setFocusedCell({ row: clampedRow, col: clampedCol });

      // Find cell by data attribute within current grid/table
      const selector = `[data-grid-cell="${gridId}-${clampedRow}-${clampedCol}"]`;
      const cellEl = containerRef.current
        ? containerRef.current.querySelector<HTMLElement>(selector)
        : document.querySelector<HTMLElement>(selector);

      if (cellEl) {
        cellEl.focus();
      }
    },
    [rowCount, colCount, gridId]
  );

  const getCellProps = useCallback(
    (row: number, col: number) => {
      const isFocused =
        focusedCell !== null
          ? focusedCell.row === row && focusedCell.col === col
          : row === 0 && col === 0;

      return {
        role: 'gridcell' as const,
        tabIndex: isFocused ? 0 : -1,
        'data-grid-cell': `${gridId}-${row}-${col}`,
        'aria-colindex': col + 1,
        onFocus: () => {
          setFocusedCell({ row, col });
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          // If focus is inside an input/textarea and user is typing, let input handle arrows
          const target = e.target as HTMLElement;
          const isInput =
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable;

          if (isInput && target !== e.currentTarget) {
            if (e.key === 'Escape') {
              e.currentTarget.focus();
              e.preventDefault();
            }
            return;
          }

          let handled = false;

          switch (e.key) {
            case 'ArrowUp':
              focusCellElement(row - 1, col);
              handled = true;
              break;
            case 'ArrowDown':
              focusCellElement(row + 1, col);
              handled = true;
              break;
            case 'ArrowLeft':
              focusCellElement(row, col - 1);
              handled = true;
              break;
            case 'ArrowRight':
              focusCellElement(row, col + 1);
              handled = true;
              break;
            case 'Home':
              if (e.ctrlKey) {
                focusCellElement(0, 0);
              } else {
                focusCellElement(row, 0);
              }
              handled = true;
              break;
            case 'End':
              if (e.ctrlKey) {
                focusCellElement(rowCount - 1, colCount - 1);
              } else {
                focusCellElement(row, colCount - 1);
              }
              handled = true;
              break;
            case 'PageUp':
              focusCellElement(Math.max(0, row - 10), col);
              handled = true;
              break;
            case 'PageDown':
              focusCellElement(Math.min(rowCount - 1, row + 10), col);
              handled = true;
              break;
            case 'Enter':
            case ' ':
              if (onActivate) {
                onActivate(row, col);
                handled = true;
              }
              break;
            default:
              break;
          }

          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
      };
    },
    [focusedCell, focusCellElement, gridId, onActivate, rowCount, colCount]
  );

  const gridProps = {
    role: 'grid' as const,
    'aria-rowcount': rowCount,
    'aria-colcount': colCount,
    ref: containerRef,
  };

  const getRowProps = useCallback(
    (row: number) => ({
      role: 'row' as const,
      'aria-rowindex': row + 1,
    }),
    []
  );

  return {
    focusedCell,
    setFocusedCell,
    focusCellElement,
    getCellProps,
    gridProps,
    getRowProps,
    containerRef,
  };
}
