import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/api';
import { NearDeadlineFloatingWidget } from './NearDeadlineFloatingWidget';
import { TaskCompletionModal, TaskData } from './TaskCompletionModal';

export const GlobalNearDeadlineWidget: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [completingTask, setCompletingTask] = useState<TaskData | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const res = await api.get('/tasks');
      setTasks(res.data || []);
    } catch (err) {
      // Silently catch background errors so app experience stays smooth
      console.warn('Background urgent tasks fetch error:', err);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    fetchTasks();

    // Poll every 90 seconds in background
    const interval = setInterval(fetchTasks, 90000);

    // Refresh when user returns to window tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTasks();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Listen for custom task refresh events if any page mutates a task
    const handleTaskUpdated = () => fetchTasks();
    window.addEventListener('task:refresh', handleTaskUpdated);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('task:refresh', handleTaskUpdated);
    };
  }, [fetchTasks]);

  const handleCompletionSuccess = (updatedTask: TaskData) => {
    setTasks(prev => prev.map(t => t._id === updatedTask._id ? updatedTask : t));
    setCompletingTask(null);
    window.dispatchEvent(new CustomEvent('task:completed', { detail: updatedTask }));
  };

  if (!isAuthenticated || !user) return null;

  return (
    <>
      <NearDeadlineFloatingWidget
        tasks={tasks}
        onOpenCompleteModal={(task) => setCompletingTask(task)}
      />
      <TaskCompletionModal
        task={completingTask}
        isOpen={!!completingTask}
        onClose={() => setCompletingTask(null)}
        onSuccess={handleCompletionSuccess}
      />
    </>
  );
};
