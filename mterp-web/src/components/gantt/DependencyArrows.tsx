import React, { useMemo } from 'react';
import { ProjectTask } from '../../types';

export interface TaskCoordinates {
  x: number; // bar left
  y: number; // bar vertical center
  width: number; // bar width
  isMilestone?: boolean;
  isCritical?: boolean;
}

interface DependencyArrowsProps {
  tasks: ProjectTask[];
  taskCoordinates: Map<string, TaskCoordinates>;
  width: number;
  height: number;
}

const getNormalizedId = (id: unknown): string => {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id !== null) {
    if ('_id' in id && (id as { _id: unknown })._id) return String((id as { _id: unknown })._id);
    if ('id' in id && (id as { id: unknown }).id) return String((id as { id: unknown }).id);
  }
  return String(id);
};

export const DependencyArrows: React.FC<DependencyArrowsProps> = ({
  tasks,
  taskCoordinates,
  width,
  height,
}) => {
  const paths = useMemo(() => {
    const list: {
      id: string;
      d: string;
      isCritical: boolean;
      arrowX: number;
      arrowY: number;
    }[] = [];

    // Set of IDs of tasks that are currently visible
    const visibleIdSet = new Set(tasks.map(t => getNormalizedId(t._id)));

    tasks.forEach(succTask => {
      const succId = getNormalizedId(succTask._id);
      if (!succId || !visibleIdSet.has(succId)) return;

      const succCoord = taskCoordinates.get(succId);
      if (!succCoord || !succTask.predecessors || !Array.isArray(succTask.predecessors)) return;

      succTask.predecessors.forEach((pred, predIdx) => {
        const predId = getNormalizedId(pred.taskId);
        // CRITICAL: Arrow must only render if BOTH predecessor and successor are visible tasks
        if (!predId || !visibleIdSet.has(predId) || predId === succId) return;

        const predCoord = taskCoordinates.get(predId);
        if (!predCoord) return;

        // Ensure valid finite numbers
        if (
          !Number.isFinite(predCoord.x) ||
          !Number.isFinite(predCoord.y) ||
          !Number.isFinite(succCoord.x) ||
          !Number.isFinite(succCoord.y)
        ) {
          return;
        }

        const isCritical = Boolean(succTask.isCritical && predCoord.isCritical);
        const type = pred.type || 'FS';

        let fromX = 0;
        let fromY = predCoord.y;
        let toX = 0;
        let toY = succCoord.y;

        // Adjust anchor points for milestones (milestone diamond tip offset)
        const predMilestoneOffset = predCoord.isMilestone ? 8 : 0;
        const succMilestoneOffset = succCoord.isMilestone ? 8 : 0;

        // Determine anchor points based on relation type
        if (type === 'FS') {
          fromX = predCoord.x + predCoord.width + (predCoord.isMilestone ? 0 : 0);
          toX = succCoord.x - succMilestoneOffset;
        } else if (type === 'SS') {
          fromX = predCoord.x - predMilestoneOffset;
          toX = succCoord.x - succMilestoneOffset;
        } else if (type === 'FF') {
          fromX = predCoord.x + predCoord.width;
          toX = succCoord.x + succCoord.width + succMilestoneOffset;
        } else if (type === 'SF') {
          fromX = predCoord.x - predMilestoneOffset;
          toX = succCoord.x + succCoord.width + succMilestoneOffset;
        }

        if (!Number.isFinite(fromX) || !Number.isFinite(toX)) return;

        // Generate orthogonal SVG path
        let d = '';
        const stub = 12;

        if (type === 'FS') {
          if (toX >= fromX + stub * 2) {
            // Normal forward link: Right -> Vertical -> Right
            const midX = fromX + stub;
            d = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
          } else {
            // Overlap loopback: Right -> Down/Up in row gutter -> Left past toX -> Down/Up to toY -> Right
            const rowDeltaY = toY >= fromY ? 20 : -20;
            const midY = fromY + rowDeltaY;
            const loopX = Math.max(2, toX - stub);
            d = `M ${fromX} ${fromY} L ${fromX + stub} ${fromY} L ${fromX + stub} ${midY} L ${loopX} ${midY} L ${loopX} ${toY} L ${toX} ${toY}`;
          }
        } else if (type === 'SS') {
          const minX = Math.max(2, Math.min(fromX, toX) - stub);
          d = `M ${fromX} ${fromY} L ${minX} ${fromY} L ${minX} ${toY} L ${toX} ${toY}`;
        } else if (type === 'FF') {
          const maxX = Math.max(fromX, toX) + stub;
          d = `M ${fromX} ${fromY} L ${maxX} ${fromY} L ${maxX} ${toY} L ${toX} ${toY}`;
        } else {
          // SF
          const minX = Math.max(2, fromX - stub);
          d = `M ${fromX} ${fromY} L ${minX} ${fromY} L ${minX} ${toY} L ${toX} ${toY}`;
        }

        list.push({
          id: `${predId}->${succId}-${predIdx}`,
          d,
          isCritical,
          arrowX: toX,
          arrowY: toY,
        });
      });
    });

    return list;
  }, [tasks, taskCoordinates]);

  return (
    <svg
      className="dependency-arrows-layer absolute top-0 left-0 pointer-events-none z-10"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Standard arrowhead marker */}
        <marker
          id="arrow-default"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748b" />
        </marker>

        {/* Critical path arrowhead marker */}
        <marker
          id="arrow-critical"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
        </marker>
      </defs>

      {paths.map(item => (
        <path
          key={item.id}
          d={item.d}
          fill="none"
          stroke={item.isCritical ? '#ef4444' : '#64748b'}
          strokeWidth={item.isCritical ? 1.75 : 1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          markerEnd={item.isCritical ? 'url(#arrow-critical)' : 'url(#arrow-default)'}
          className="opacity-75 transition-opacity hover:opacity-100"
        />
      ))}
    </svg>
  );
};
