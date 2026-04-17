import { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, Briefcase, Check, X, ChevronRight,
  UserPlus, UserMinus, Building, Loader, Save, MapPin,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import api from '../api/api';
import { Card, LoadingOverlay } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { PhotoView } from 'react-photo-view';
import { getImageUrl } from '../utils/image';

interface Worker {
  _id: string;
  fullName: string;
  username: string;
  role: string;
  profileImage?: string;
  isVerified?: boolean;
}

interface Project {
  _id: string;
  nama: string;
  lokasi: string;
  status?: string;
  assignedTo?: Worker[];
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  worker:     { bg: '#EEF2FF', text: '#4F46E5' },
  tukang:     { bg: '#F0FDF4', text: '#16A34A' },
  helper:     { bg: '#FFF7ED', text: '#EA580C' },
  foreman:    { bg: '#FDF4FF', text: '#9333EA' },
  supervisor: { bg: '#EFF6FF', text: '#2563EB' },
  site_manager: { bg: '#FFF1F2', text: '#E11D48' },
  default:    { bg: '#F1F5F9', text: '#64748B' },
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.default;
}

function Avatar({ user }: { user: Worker }) {
  const initials = user.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-border-light bg-bg-secondary flex items-center justify-center font-bold text-sm text-text-secondary">
      {user.profileImage ? (
        <PhotoView src={getImageUrl(user.profileImage)}>
          <img src={getImageUrl(user.profileImage)} alt={user.fullName} className="w-full h-full object-cover cursor-pointer" />
        </PhotoView>
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export default function ProjectAssign() {
  const { user: authUser } = useAuth();

  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Selection
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Search
  const [projectSearch, setProjectSearch] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');

  const canManage = authUser?.role && ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project'].includes(authUser.role);

  // ── Fetch ────────────────────────────────────────────
  useEffect(() => {
    fetchProjects();
    fetchWorkers();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('fetch projects', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await api.get('/users');
      // Include field workers + supervisors — exclude top management
      const fieldRoles = ['worker', 'tukang', 'helper', 'foreman', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'];
      setAllWorkers((res.data as Worker[]).filter((u) => fieldRoles.includes(u.role)));
    } catch (err) {
      console.error('fetch workers', err);
    } finally {
      setLoadingWorkers(false);
    }
  };

  const fetchProjectMembers = async (project: Project) => {
    try {
      const res = await api.get(`/projects/${project._id}/members`);
      const members: Worker[] = res.data.assignedTo ?? [];
      setAssignedIds(new Set(members.map((m) => m._id)));
    } catch {
      setAssignedIds(new Set((project.assignedTo ?? []).map((m) => m._id)));
    }
  };

  // ── Derived lists ────────────────────────────────────
  const filteredProjects = useMemo(() =>
    projects.filter((p) =>
      `${p.nama} ${p.lokasi}`.toLowerCase().includes(projectSearch.toLowerCase())
    ), [projects, projectSearch]);

  const filteredWorkers = useMemo(() =>
    allWorkers.filter((w) =>
      `${w.fullName} ${w.username} ${w.role}`.toLowerCase().includes(workerSearch.toLowerCase())
    ), [allWorkers, workerSearch]);

  const assignedWorkers = useMemo(() =>
    allWorkers.filter((w) => assignedIds.has(w._id)), [allWorkers, assignedIds]);

  // ── Actions ──────────────────────────────────────────
  const handleSelectProject = (p: Project) => {
    setSelectedProject(p);
    setSaved(false);
    fetchProjectMembers(p);
    setWorkerSearch('');
  };

  const toggle = (workerId: string) => {
    if (!canManage) return;
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedProject) return;
    setSaving(true);
    try {
      await api.put(`/projects/${selectedProject._id}/members`, {
        userIds: Array.from(assignedIds),
      });
      setSaved(true);
      // Refresh project list to reflect new counts
      fetchProjects();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to save assignments');
    } finally {
      setSaving(false);
    }
  };

  // ── Status badge ─────────────────────────────────────
  const statusBadge = (status?: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      Planning:    { bg: '#EEF2FF', text: '#4F46E5', label: 'Planning' },
      'In Progress': { bg: '#ECFDF5', text: '#059669', label: 'In Progress' },
      Completed:   { bg: '#F1F5F9', text: '#94A3B8', label: 'Completed' },
      'On Hold':   { bg: '#FFF7ED', text: '#EA580C', label: 'On Hold' },
    };
    return map[status ?? ''] ?? { bg: '#F1F5F9', text: '#94A3B8', label: status ?? 'Unknown' };
  };

  const loading = loadingProjects || loadingWorkers;

  return (
    <div className="p-6 max-w-[1200px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 shadow-sm">
          <Users size={28} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight">
            Project Assignments
          </h1>
          <p className="text-sm text-text-muted m-0 mt-0.5">
            Select a project, then toggle workers to assign or remove them
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingOverlay visible />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">

          {/* ══ LEFT: Project List ══════════════════════ */}
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects…"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 border-2 border-border-light rounded-xl text-sm font-medium bg-bg-white text-text-primary outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
              {filteredProjects.length === 0 ? (
                <div className="py-12 text-center text-text-muted text-sm">No projects found</div>
              ) : (
                filteredProjects.map((p) => {
                  const s = statusBadge(p.status);
                  const isActive = selectedProject?._id === p._id;
                  return (
                    <button
                      key={p._id}
                      onClick={() => handleSelectProject(p)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 group ${
                        isActive
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border-light bg-bg-white hover:border-primary/40 hover:shadow-sm'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isActive ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted group-hover:bg-primary/10 group-hover:text-primary'}`}>
                        <Briefcase size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-sm font-bold truncate ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                            {p.nama}
                          </span>
                          {isActive && <ChevronRight size={16} className="text-primary shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1.5">
                          <MapPin size={11} />
                          <span className="truncate">{p.lokasi}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: s.bg, color: s.text }}
                          >
                            {s.label}
                          </span>
                          <span className="text-[10px] text-text-muted font-medium">
                            {(p.assignedTo?.length ?? 0)} assigned
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ══ RIGHT: Worker Assignment ════════════════ */}
          {!selectedProject ? (
            <Card className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-20 h-20 rounded-2xl bg-bg-secondary flex items-center justify-center">
                <Building size={40} className="text-text-muted opacity-40" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold text-text-primary m-0 mb-1">Select a Project</h3>
                <p className="text-sm text-text-muted m-0">
                  Choose a project from the list to manage its assigned workers
                </p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">

              {/* Project header + save */}
              <Card className="!p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-text-primary m-0 truncate">{selectedProject.nama}</h2>
                  <p className="text-xs text-text-muted m-0 mt-0.5 flex items-center gap-1">
                    <MapPin size={11} /> {selectedProject.lokasi}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-text-muted">
                    <strong className="text-text-primary">{assignedIds.size}</strong> assigned
                  </span>
                  {canManage && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold border-none cursor-pointer transition-all ${
                        saved
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-primary text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(37,99,235,0.35)]'
                      } disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
                    >
                      {saving ? (
                        <Loader size={16} className="animate-spin" />
                      ) : saved ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Save size={16} />
                      )}
                      {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                    </button>
                  )}
                </div>
              </Card>

              {/* Currently assigned summary strip */}
              {assignedWorkers.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wide">Assigned:</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {assignedWorkers.slice(0, 8).map((w) => (
                      <div
                        key={w._id}
                        className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 rounded-full px-2.5 py-1"
                        title={w.fullName}
                      >
                        <span className="text-xs font-semibold text-primary truncate max-w-[100px]">{w.fullName.split(' ')[0]}</span>
                        {canManage && (
                          <button
                            onClick={() => toggle(w._id)}
                            className="text-primary/60 hover:text-danger transition-colors border-none bg-transparent cursor-pointer p-0 flex"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    {assignedWorkers.length > 8 && (
                      <span className="text-xs font-bold text-text-muted">+{assignedWorkers.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Worker search */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search workers by name, username, or role…"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 border-2 border-border-light rounded-xl text-sm font-medium bg-bg-white text-text-primary outline-none focus:border-primary transition-colors"
                />
              </div>

              {!canManage && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
                  <AlertCircle size={14} />
                  <span>You have view-only access. Contact an admin to modify assignments.</span>
                </div>
              )}

              {/* Worker list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                {filteredWorkers.length === 0 ? (
                  <div className="col-span-2 py-12 text-center text-text-muted text-sm">No workers found</div>
                ) : (
                  filteredWorkers.map((w) => {
                    const isAssigned = assignedIds.has(w._id);
                    const rc = roleColor(w.role);
                    return (
                      <button
                        key={w._id}
                        onClick={() => toggle(w._id)}
                        disabled={!canManage}
                        className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                          isAssigned
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border-light bg-bg-white hover:border-primary/30'
                        } disabled:cursor-default`}
                      >
                        <div className="relative">
                          <Avatar user={w} />
                          {isAssigned && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                              <Check size={10} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-text-primary truncate">{w.fullName}</div>
                          <div className="text-xs text-text-muted truncate">@{w.username}</div>
                          <span
                            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 capitalize"
                            style={{ backgroundColor: rc.bg, color: rc.text }}
                          >
                            {w.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {canManage && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                            isAssigned
                              ? 'bg-primary text-white'
                              : 'bg-bg-secondary text-text-muted'
                          }`}>
                            {isAssigned ? <UserMinus size={14} /> : <UserPlus size={14} />}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
