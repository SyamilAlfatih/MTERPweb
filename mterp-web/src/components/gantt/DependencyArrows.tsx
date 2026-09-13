import React, { useMemo } from 'react';
import { ProjectTask } from '../../types';

interface TaskCoordinates {
  x: number; // bar left
  y: number; // bar vertical center
  width: number; // bar width
  isCritical?: boolean;
}

interface DependencyArrowsProps {
  tasks: ProjectTask[];
  taskCoordinates: Map<string, TaskCoordinates>;
  width: number;
  height: number;
}

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

    tasks.forEach(succTask => {
      const succId = succTask._id;
      const succCoord = taskCoordinates.get(succId);
      if (!succCoord || !succTask.predecessors) return;

      succTask.predecessors.forEach((pred, predIdx) => {
        const predId = typeof pred.taskId === 'string' ? pred.taskId : pred.taskId?._id;
        if (!predId) return;

        const predCoord = taskCoordinates.get(predId);
        if (!predCoord) return;

        const isCritical = Boolean(succTask.isCritical && predCoord.isCritical);
        const type = pred.type || 'FS';

        let fromX = 0;
        let fromY = predCoord.y;
        let toX = 0;
        let toY = succCoord.y;

        // Determine anchor points based on relation type
        if (type === 'FS') {
          fromX = predCoord.x + predCoord.width;
          toX = succCoord.x;
        } else if (type === 'SS') {
          fromX = predCoord.x;
          toX = succCoord.x;
        } else if (type === 'FF') {
          fromX = predCoord.x + predCoord.width;
          toX = succCoord.x + succCoord.width;
        } else if (type === 'SF') {
          fromX = predCoord.x;
          toX = succCoord.x + succCoord.width;
        }

        // Generate orthogonal SVG path
        let d = '';
        const stub = 12;

        if (type === 'FS') {
          if (toX >= fromX + stub * 2) {
            // Normal forward link: Right -> Vertical -> Right
            const midX = fromX + stub;
            d = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
          } else {
            // Overlap loopback: Right -> Down/Up midway -> Left -> Down/Up to toY -> Right
            const midY = fromY + (toY > fromY ? 14 : -14);
            const loopX = toX - stub;
            d = `M ${fromX} ${fromY} L ${fromX + stub} ${fromY} L ${fromX + stub} ${midY} L ${loopX} ${midY} L ${loopX} ${toY} L ${toX} ${toY}`;
          }
        } else if (type === 'SS') {
          const minX = Math.min(fromX, toX) - stub;
          d = `M ${fromX} ${fromY} L ${minX} ${fromY} L ${minX} ${toY} L ${toX} ${toY}`;
        } else if (type === 'FF') {
          const maxX = Math.max(fromX, toX) + stub;
          d = `M ${fromX} ${fromY} L ${maxX} ${fromY} L ${maxX} ${toY} L ${toX} ${toY}`;
        } else {
          // SF
          d = `M ${fromX} ${fromY} L ${fromX - stub} ${fromY} L ${fromX - stub} ${toY} L ${toX} ${toY}`;
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
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
        </marker>

        {/* Critical path arrowhead marker */}
        <marker
          id="arrow-critical"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
        </marker>
      </defs>

      {paths.map(item => (
        <path
          key={item.id}
          d={item.d}
          fill="none"
          stroke={item.isCritical ? '#dc2626' : '#64748b'}
          strokeWidth={item.isCritical ? 1.75 : 1.25}
          strokeDasharray={item.isCritical ? undefined : undefined}
          markerEnd={item.isCritical ? 'url(#arrow-critical)' : 'url(#arrow-default)'}
          className="transition-colors duration-150"
        />
      ))}
    </svg>
  );
};
