import React, { useState, useEffect, useMemo } from 'react';

import { 
  Users as UsersIcon, 
  Search, 
  Filter, 
  ShieldAlert, 
  CheckCircle, 
  Trash2, 
  Edit,
  UserPlus,
  ChevronDown,
  X
} from 'lucide-react';
import { 
  getUsers, 
  createUser, 
  updateUserRole, 
  verifyUserManually, 
  deleteUser 
} from '../api/api';
import { User } from '../types';
import { Card } from '../components/shared';

const ROLE_OPTIONS = [
  { value: 'worker', label: 'Worker' },
  { value: 'tukang', label: 'Tukang' },
  { value: 'helper', label: 'Helper' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'site_manager', label: 'Site Manager' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'asset_admin', label: 'Asset Admin' },
  { value: 'admin_project', label: 'Admin Project' },
  { value: 'director', label: 'Director' },
  { value: 'president_director', label: 'President Director' },
  { value: 'operational_director', label: 'Operational Director' },
  { value: 'owner', label: 'Owner' },
];

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // New User Form State
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: 'worker',
  });

  // Edit Role State
  const [editRole, setEditRole] = useState('');

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users', error);
      alert('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRole = roleFilter ? user.role === roleFilter : true;
      
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(newUser);
      setIsAddModalOpen(false);
      setNewUser({ username: '', email: '', fullName: '', password: '', role: 'worker' });
      fetchUsers();
    } catch (error: unknown) {
      alert((error as { response?: { data?: { msg?: string } } }).response?.data?.msg || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await deleteUser(id);
        fetchUsers();
      } catch (error: unknown) {
        alert((error as { response?: { data?: { msg?: string } } }).response?.data?.msg || 'Failed to delete user');
      }
    }
  };

  const handleVerifyUser = async (id: string) => {
    if (window.confirm('Bypass email verification for this user?')) {
      try {
        await verifyUserManually(id);
        fetchUsers();
      } catch (error: unknown) {
        alert((error as { response?: { data?: { msg?: string } } }).response?.data?.msg || 'Failed to verify user');
      }
    }
  };

  const handleOpenEditRole = (user: User) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setIsEditRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser?._id) return;
    try {
      await updateUserRole(selectedUser._id, editRole);
      setIsEditRoleModalOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      alert((error as { response?: { data?: { msg?: string } } }).response?.data?.msg || 'Failed to update role');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto max-lg:p-4 max-sm:p-3 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-bg flex items-center justify-center shadow-sm shrink-0">
            <UsersIcon size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight uppercase">User Management</h1>
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Manage access & roles</span>
          </div>
        </div>
        <button 
          className="flex items-center justify-center gap-2 bg-primary text-white border-none py-3 px-5 rounded-xl text-sm font-black uppercase tracking-wider cursor-pointer transition-all shadow-md shadow-primary/20 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto" 
          onClick={() => setIsAddModalOpen(true)}
        >
          <UserPlus size={18} strokeWidth={2.5} />
          <span>Add User</span>
        </button>
      </div>

      {/* Filters & Search Wrapper */}
      <div className="mb-8">
        <Card className="!p-5 border-2 border-border-light">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Search Users</label>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Name, email, or username..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full py-3.5 pr-4 pl-11 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-sm font-bold transition-all outline-none focus:border-primary shadow-sm"
                />
              </div>
            </div>
            <div className="sm:w-[240px]">
              <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Filter by Role</label>
              <div className="relative">
                <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <select 
                  value={roleFilter} 
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full py-3.5 pr-10 pl-11 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-sm font-bold cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-sm"
                >
                  <option value="">All Roles</option>
                  {ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* User Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <div className="w-16 h-16 bg-bg-secondary text-text-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UsersIcon size={32} />
            </div>
            <h3 className="text-lg font-black text-text-primary mb-2">No Users Found</h3>
            <p className="text-sm font-medium text-text-secondary m-0">Try adjusting your search criteria or role filter.</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isDangerRole = ['owner', 'president_director', 'operational_director', 'director'].includes(user.role);
            const isWarningRole = ['asset_admin', 'admin_project'].includes(user.role);
            const isInfoRole = ['site_manager', 'supervisor', 'foreman'].includes(user.role);
            
            return (
              <Card key={user._id} className="!p-5 border-2 border-border-light hover:border-primary transition-all relative overflow-hidden group flex flex-col h-full">
                {/* Accent line based on role */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isDangerRole ? 'bg-danger' : isWarningRole ? 'bg-warning' : isInfoRole ? 'bg-info' : 'bg-primary-bg'}`} />
                
                <div className="pl-2 flex-1 flex flex-col">
                  {/* Top section: Avatar, Info, Status */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                       <div className="w-12 h-12 rounded-xl bg-bg-secondary text-text-secondary flex items-center justify-center font-black text-lg overflow-hidden shrink-0 border-2 border-border-light">
                        {user.profilePhoto ? (
                          <img src={user.profilePhoto} alt={user.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{user.fullName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-base text-text-primary truncate" title={user.fullName}>{user.fullName}</span>
                        <span className="text-xs font-bold text-text-muted truncate">@{user.username}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body section: Role Badge & Contact */}
                  <div className="mb-4">
                    <span className={`inline-block px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider mb-3 ${
                      isDangerRole ? 'bg-danger-bg text-danger border-2 border-danger/20' :
                      isWarningRole ? 'bg-warning-bg text-warning border-2 border-warning/20' :
                      isInfoRole ? 'bg-info-bg text-info border-2 border-info/20' :
                      'bg-bg-secondary text-text-secondary border-2 border-transparent'
                     }`}>
                      {ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role}
                    </span>

                    <div className="space-y-1.5 bg-bg-secondary/50 p-3 rounded-xl border border-border-light/50">
                      {user.email && <div className="text-xs font-medium text-text-primary truncate">{user.email}</div>}
                      {user.phone ? (
                        <div className="text-xs text-text-secondary truncate">{user.phone}</div>
                      ) : (
                         <div className="text-xs text-text-muted/50 truncate italic">No phone</div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1" />

                  {/* Action Footer */}
                  <div className="flex items-center justify-between pt-4 mt-auto border-t-2 border-border-light/50">
                    <div className="flex items-center">
                      {user.isVerified ? (
                        <div className="flex items-center gap-1.5 text-success">
                          <CheckCircle size={16} strokeWidth={2.5} /> 
                          <span className="text-[10px] font-black uppercase tracking-wider">Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-warning">
                          <ShieldAlert size={16} strokeWidth={2.5} /> 
                          <span className="text-[10px] font-black uppercase tracking-wider">Pending</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                       {!user.isVerified && (
                         <button 
                           className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-white border-2 border-success/20 text-success cursor-pointer transition-all hover:bg-success hover:text-white active:scale-95" 
                           onClick={() => handleVerifyUser(user._id!)}
                           title="Verify Manually"
                         >
                           <CheckCircle size={18} />
                         </button>
                       )}
                       <button 
                         className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-white border-2 border-info/20 text-info cursor-pointer transition-all hover:bg-info hover:text-white active:scale-95" 
                         onClick={() => handleOpenEditRole(user)}
                         title="Edit Role"
                       >
                         <Edit size={18} />
                       </button>
                       <button 
                         className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-white border-2 border-danger/20 text-danger cursor-pointer transition-all hover:bg-danger hover:text-white active:scale-95" 
                         onClick={() => handleDeleteUser(user._id!)}
                         title="Delete"
                       >
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-2" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                   <UserPlus size={20} strokeWidth={2.5} />
                 </div>
                 <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">New User</h3>
               </div>
               <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border-light transition-colors cursor-pointer active:scale-95" onClick={() => setIsAddModalOpen(false)}>
                 <X size={18} />
               </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Full Name *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary transition-all bg-bg-white focus:border-primary outline-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Username *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary transition-all bg-bg-white focus:border-primary outline-none lowercase"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Email *</label>
                <input 
                  type="email" 
                  required 
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary transition-all bg-bg-white focus:border-primary outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Password *</label>
                <input 
                  type="password" 
                  required 
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary transition-all bg-bg-white focus:border-primary outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Role *</label>
                <div className="relative">
                  <select 
                    required
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="w-full py-3.5 pr-10 pl-4 border-2 border-border-light rounded-xl text-text-primary text-sm font-bold cursor-pointer appearance-none transition-all outline-none bg-bg-white focus:border-primary shadow-sm"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
                <p className="text-[10px] font-bold text-primary bg-primary-bg p-2 rounded-lg mt-3 uppercase tracking-wider text-center">
                  Users created by owner are instantly verified.
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" className="flex-1 py-4 bg-bg-white border-2 border-border-light rounded-xl text-sm font-black text-text-secondary cursor-pointer transition-all hover:bg-bg-secondary active:scale-95 uppercase tracking-wider" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                <button type="submit" className="flex-[2] py-4 bg-primary border-none rounded-xl text-sm font-black text-white cursor-pointer transition-all shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 uppercase tracking-wider">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {isEditRoleModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsEditRoleModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-2" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center text-info shrink-0">
                   <Edit size={20} strokeWidth={2.5} />
                 </div>
                 <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Change Role</h3>
               </div>
               <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border-light transition-colors cursor-pointer active:scale-95" onClick={() => setIsEditRoleModalOpen(false)}>
                 <X size={18} />
               </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-bg-secondary/50 p-4 rounded-xl border border-border-light/50 flex flex-col">
                 <span className="text-[10px] font-bold text-text-muted uppercase mb-1">Target User</span>
                 <span className="text-base font-black text-text-primary">{selectedUser.fullName}</span>
                 <span className="text-xs text-text-secondary">@{selectedUser.username}</span>
              </div>
              
              <div className="flex flex-col">
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">New Role</label>
                <div className="relative">
                  <select 
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full py-4 pr-10 pl-4 border-2 border-border-light rounded-xl text-text-primary text-sm font-black cursor-pointer appearance-none transition-all outline-none bg-bg-white focus:border-primary shadow-sm"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" className="flex-1 py-4 bg-bg-white border-2 border-border-light rounded-xl text-sm font-black text-text-secondary cursor-pointer transition-all hover:bg-bg-secondary active:scale-95 uppercase tracking-wider" onClick={() => setIsEditRoleModalOpen(false)}>Cancel</button>
                <button type="button" className="flex-[2] py-4 bg-primary border-none rounded-xl text-sm font-black text-white cursor-pointer transition-all shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 uppercase tracking-wider" onClick={handleSaveRole}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
