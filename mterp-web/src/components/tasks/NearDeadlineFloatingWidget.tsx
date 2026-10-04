import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, Clock, Camera, ChevronRight, ChevronLeft, 
  X, BellRing, Bell, CheckSquare, Minimize2, Maximize2 
} from 'lucide-react';
import { TaskData } from './TaskCompletionModal';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { formatDate as formatWIBDate } from '../../utils/date';

interface NearDeadlineFloatingWidgetProps {
  tasks: TaskData[];
  onOpenCompleteModal: (task: TaskData) => void;
}

export const NearDeadlineFloatingWidget: React.FC<NearDeadlineFloatingWidgetProps> = ({
  tasks,
  onOpenCompleteModal,
}) => {
  const { user } = useAuth();
  const { isPushSubscribed, togglePush, isPushSupported } = useNotification();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);

  // Find incomplete tasks near deadline or overdue
  const urgentTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    const now = new Date().getTime();

    return tasks.filter(task => {
      if (task.status === 'completed' || task.status === 'cancelled') return false;
      if (!task.dueDate) return false;

      // Filter: if regular worker, only their tasks; if supervisor/manager, their tasks or high priority
      const isAssignedToMe = task.assignedTo?._id === user?._id;
      const canManage = user?.role && [
        'owner', 'president_director', 'operational_director', 'director',
        'site_manager', 'supervisor', 'admin_project'
      ].includes(user.role);

      if (!isAssignedToMe && !canManage) return false;

      const dueTime = new Date(task.dueDate).getTime();
      const diffHours = (dueTime - now) / (1000 * 60 * 60);

      // Overdue (diffHours < 0) or near deadline within 48 hours
      return diffHours <= 48;
    }).sort((a, b) => {
      // Sort most overdue first
      const timeA = new Date(a.dueDate!).getTime();
      const timeB = new Date(b.dueDate!).getTime();
      return timeA - timeB;
    });
  }, [tasks, user]);

  if (isDismissed || urgentTasks.length === 0) return null;

  const currentTask = urgentTasks[Math.min(currentIndex, urgentTasks.length - 1)];
  if (!currentTask) return null;

  const now = new Date().getTime();
  const dueTime = new Date(currentTask.dueDate!).getTime();
  const diffHours = (dueTime - now) / (1000 * 60 * 60);
  const isOverdue = diffHours < 0;

  const getUrgencyBadge = () => {
    if (isOverdue) {
      const days = Math.abs(Math.floor(diffHours / 24));
      const hours = Math.abs(Math.floor(diffHours % 24));
      return {
        label: days > 0 ? `Terlambat ${days} hari ${hours} jam` : `Terlambat ${hours} jam`,
        bg: 'bg-rose-600 text-white ring-2 ring-rose-400/40 animate-pulse',
        border: 'border-rose-500/70',
        isOverdue: true,
      };
    } else if (diffHours <= 24) {
      const hours = Math.max(1, Math.floor(diffHours));
      return {
        label: `Sisa ${hours} jam lagi!`,
        bg: 'bg-amber-500 text-slate-950 font-extrabold ring-2 ring-amber-400/40 animate-pulse',
        border: 'border-amber-500/70',
        isOverdue: false,
      };
    } else {
      const days = Math.ceil(diffHours / 24);
      return {
        label: `Tenggat ${days} hari lagi`,
        bg: 'bg-amber-600/90 text-white font-bold',
        border: 'border-amber-500/50',
        isOverdue: false,
      };
    }
  };

  const urgency = getUrgencyBadge();
  const isAssignedToCurrent = currentTask.assignedTo?._id === user?._id;

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      await togglePush();
    } catch (err) {
      console.error('Failed to toggle push notification', err);
    } finally {
      setEnablingPush(false);
    }
  };

  // Minimized floating bubble
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95 duration-200"
        onClick={() => setIsMinimized(false)}
        role="button"
        title="Klik untuk membuka pengingat tugas mendesak"
      >
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-2xl backdrop-blur-md border ${isOverdue ? 'bg-rose-900/95 text-white border-rose-500' : 'bg-slate-900/95 text-amber-400 border-amber-500/70'}`}>
          <div className="relative">
            <BellRing size={16} className={isOverdue ? 'animate-bounce text-rose-300' : 'text-amber-400'} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          </div>
          <span className="text-xs font-extrabold tracking-wide">
            {urgentTasks.length} Tugas Urgent
          </span>
          <Maximize2 size={12} className="opacity-75" />
        </div>
      </div>
    );
  }

  return (
    <aside 
      aria-label="Pemberitahuan Tugas Mendekati Tenggat Waktu"
      className="fixed bottom-5 right-5 z-40 w-[92vw] max-w-[390px] animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className={`rounded-2xl p-4 shadow-2xl backdrop-blur-xl border ${urgency.border} ${isOverdue ? 'bg-slate-950/95 text-slate-100 ring-2 ring-rose-500/30' : 'bg-slate-950/95 text-slate-100 ring-2 ring-amber-500/30'}`}>
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${urgency.bg} shadow-xs flex items-center gap-1 font-mono`}>
              <Clock size={11} />
              {urgency.label}
            </span>
            {urgentTasks.length > 1 && (
              <span className="text-[11px] text-white/60 font-mono font-semibold">
                ({currentIndex + 1}/{urgentTasks.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Kecilkan Tampilan"
              aria-label="Kecilkan widget tugas mendesak"
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Tutup Widget Sementara"
              aria-label="Tutup widget tugas mendesak"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Task Details */}
        <div className="mt-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-white/70 mb-0.5">
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${currentTask.scope === 'office' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {currentTask.scope === 'office' ? `🏛️ Kantor: ${currentTask.department || 'General'}` : `🏗️ Proyek: ${currentTask.projectId?.nama || 'Lapangan'}`}
                </span>
                {isAssignedToCurrent && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary text-white shadow-2xs">
                    Tugas Anda
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-white tracking-tight leading-snug line-clamp-2 m-0">
                {currentTask.title}
              </h4>
            </div>
          </div>

          {currentTask.subtasks && currentTask.subtasks.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-white/70 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
              <span className="flex items-center gap-1">
                <CheckSquare size={12} className="text-emerald-400" />
                Subtugas Selesai:
              </span>
              <span className="font-mono font-bold text-white">
                {currentTask.subtasks.filter(s => s.isCompleted).length} / {currentTask.subtasks.length}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenCompleteModal(currentTask)}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer active:scale-98"
            >
              <Camera size={14} />
              <span>Unggah Bukti & Selesaikan</span>
            </button>
            
            {urgentTasks.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : urgentTasks.length - 1))}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Tugas Sebelumnya"
                  aria-label="Tugas sebelumnya"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => (prev < urgentTasks.length - 1 ? prev + 1 : 0))}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Tugas Berikutnya"
                  aria-label="Tugas berikutnya"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Web Push Prompt banner if not subscribed */}
          {isPushSupported && !isPushSubscribed && (
            <div className="mt-2.5 p-2 bg-indigo-950/70 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-2 text-[11px] text-indigo-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <Bell size={13} className="text-indigo-400 shrink-0" />
                <span className="truncate">Aktifkan Notifikasi Web Push agar tidak ketinggalan tenggat.</span>
              </div>
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shrink-0 transition-colors cursor-pointer"
              >
                {enablingPush ? 'Memproses...' : 'Aktifkan'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
