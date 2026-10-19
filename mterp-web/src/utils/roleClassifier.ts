export const PAYROLL_ALLOWED_ROLES = [
    'owner', 'president_director', 'operational_director',
    'director', 'supervisor', 'site_manager', 'admin_project',
    'asset_admin'
];

export const ROLE_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
    worker: { label: 'Worker', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    tukang: { label: 'Tukang', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    helper: { label: 'Helper', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    supervisor: { label: 'Supervisor', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    site_manager: { label: 'Site Manager', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    foreman: { label: 'Mandor (Foreman)', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    asset_admin: { label: 'Asset Admin', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    admin_project: { label: 'Admin Project', bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    device_admin: { label: 'Device Admin', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    director: { label: 'Director', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    president_director: { label: 'Pres. Director', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300' },
    operational_director: { label: 'Ops. Director', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300' },
    owner: { label: 'Owner', bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-400' },
};

export const getRoleBadge = (roleStr: string = '') => {
    return ROLE_BADGES[roleStr.toLowerCase()] || {
        label: roleStr || 'Staff',
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        border: 'border-gray-200',
    };
};

export const isFieldRole = (r: string = '') => ['worker', 'tukang', 'helper'].includes(r.toLowerCase());
export const isSupervisorRole = (r: string = '') => ['foreman', 'supervisor', 'site_manager'].includes(r.toLowerCase());
export const isManagementRole = (r: string = '') => ['owner', 'president_director', 'operational_director', 'director', 'admin_project', 'asset_admin', 'device_admin'].includes(r.toLowerCase());
