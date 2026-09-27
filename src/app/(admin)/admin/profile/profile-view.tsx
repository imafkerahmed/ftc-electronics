'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  User,
  Shield,
  Mail,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Users,
  Pencil,
  X,
  FileText,
  BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  updateMyProfileAction,
  getAdminStaffProfilesAction,
  updateStaffProfileNameByAdminAction,
} from '@/app/actions/admin';

interface ProfileViewProps {
  initialUser: {
    id: string;
    email: string;
    name: string;
    role: string;
    formattedRole: string;
    avatar?: string | null;
  };
}

export default function ProfileView({ initialUser }: ProfileViewProps) {
  const [name, setName] = useState(initialUser.name);
  const [savedName, setSavedName] = useState(initialUser.name);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Staff management state (only for admin / super_admin)
  const isAdminRole = initialUser.role === 'admin' || initialUser.role === 'super_admin';
  const [staffList, setStaffList] = useState<Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    formattedRole: string;
    isActive: boolean;
    createdAt: string;
  }>>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingStaffName, setEditingStaffName] = useState('');
  const [staffSaving, setStaffSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveOwnProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      showToast('Full Name cannot be empty.', 'error');
      return;
    }

    startTransition(async () => {
      const res = await updateMyProfileAction({ name: cleanName });
      if (res.success && res.name) {
        setSavedName(res.name);
        setName(res.name);
        showToast('Your Full Name has been updated successfully.');
        // Notify navbar/layout header to refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('admin-profile-updated', { detail: { name: res.name } }));
        }
      } else {
        showToast(res.error || 'Failed to update profile.', 'error');
      }
    });
  };

  // Load staff profiles if admin
  useEffect(() => {
    if (isAdminRole) {
      setLoadingStaff(true);
      getAdminStaffProfilesAction().then((res) => {
        if (res.success && res.data) {
          setStaffList(res.data);
        }
        setLoadingStaff(false);
      });
    }
  }, [isAdminRole]);

  const handleSaveStaffName = async (staffId: string) => {
    const cleanName = editingStaffName.trim();
    if (!cleanName) {
      showToast('Staff Full Name cannot be empty.', 'error');
      return;
    }

    setStaffSaving(true);
    const res = await updateStaffProfileNameByAdminAction({
      userId: staffId,
      name: cleanName,
    });
    setStaffSaving(false);

    if (res.success) {
      showToast('Staff profile name updated.');
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, name: cleanName } : s))
      );
      if (staffId === initialUser.id) {
        setName(cleanName);
        setSavedName(cleanName);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('admin-profile-updated', { detail: { name: cleanName } }));
        }
      }
      setEditingStaffId(null);
      setEditingStaffName('');
    } else {
      showToast(res.error || 'Failed to update staff name.', 'error');
    }
  };

  const initials = (name || initialUser.email)
    .split('@')[0]
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AD';

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/system-config"
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Back to System Configurations"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <User className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Administrator Profile</h1>
            <p className="text-xs text-muted-foreground">
              Manage your human-readable Full Name and authoritative administrative identity.
            </p>
          </div>
        </div>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div
          role="status"
          className={`p-4 rounded-xl text-xs flex items-center gap-3 border shadow-xs animate-in fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="font-semibold">{toast.msg}</span>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex items-center gap-4 pb-6 border-b border-border/60">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-blue-500/20">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-foreground truncate">
              {savedName || initialUser.email}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold text-blue-500">
                <Shield className="h-3 w-3" />
                {initialUser.formattedRole}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{initialUser.email}</span>
            </div>
          </div>
        </div>

        {/* Identity Notice Callout */}
        <div className="bg-muted/40 border border-border/80 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed flex items-start gap-3">
          <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground font-semibold">Authoritative Invoice Signature:</strong> Your Full
            Name is snapshot directly into newly generated Commercial Invoices (as{' '}
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-primary">Issued By</code>) and
            quotation conversion audit entries. POS counter sales continue to use separate PIN-authenticated employee
            records.
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSaveOwnProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="fullName" className="text-xs font-bold text-foreground uppercase tracking-wider">
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="fullName"
                type="text"
                placeholder="e.g. Afker Ahmed"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                className="font-medium text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter your real name so commercial sales documents and customer correspondence properly reflect who issued the document.
              </p>
            </div>

            {/* Email (Read-Only) */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Authentication Email
              </label>
              <Input
                id="email"
                type="email"
                value={initialUser.email}
                readOnly
                disabled
                className="bg-muted/50 text-muted-foreground font-mono text-xs cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground">Managed by system authentication credentials.</p>
            </div>

            {/* Role (Read-Only) */}
            <div className="space-y-1.5">
              <label htmlFor="role" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> System Role
              </label>
              <Input
                id="role"
                type="text"
                value={initialUser.formattedRole}
                readOnly
                disabled
                className="bg-muted/50 text-muted-foreground font-semibold text-xs cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground">System role permissions cannot be escalated from profile settings.</p>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end">
            <Button
              type="submit"
              disabled={isPending || name.trim() === savedName}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2 rounded-xl px-5 h-10 shadow-xs cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving Changes…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Admin User Management Section (visible to admin/super_admin) */}
      {isAdminRole && (
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Staff & Administrator Accounts</h3>
                <p className="text-[11px] text-muted-foreground">
                  View and manage human-readable Full Names for administrative staff.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {staffList.length} Account{staffList.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loadingStaff ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span>Loading staff accounts…</span>
            </div>
          ) : staffList.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No staff accounts found.</div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
                      <th className="p-3">Full Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staffList.map((st) => {
                      const isEditingThis = editingStaffId === st.id;
                      const displayName = st.name || st.email;

                      return (
                        <tr key={st.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-semibold text-foreground">
                            {isEditingThis ? (
                              <Input
                                size={1}
                                className="h-7 text-xs font-semibold max-w-[200px]"
                                value={editingStaffName}
                                onChange={(e) => setEditingStaffName(e.target.value)}
                                placeholder="Full Name"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={st.name ? 'text-foreground' : 'text-muted-foreground italic'}>
                                  {st.name || 'Not set'}
                                </span>
                                {st.id === initialUser.id && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                    You
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-muted-foreground">{st.email}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border border-border">
                              {st.formattedRole}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                st.isActive
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {st.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {isEditingThis ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveStaffName(st.id)}
                                  disabled={staffSaving}
                                  className="h-7 px-2.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                                >
                                  {staffSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                  <span>Save</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingStaffId(null)}
                                  disabled={staffSaving}
                                  className="h-7 px-2 text-[11px] rounded-lg"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingStaffId(st.id);
                                  setEditingStaffName(st.name || '');
                                }}
                                className="h-7 px-2 text-[11px] font-bold gap-1 rounded-lg hover:bg-muted cursor-pointer"
                                title="Edit Full Name"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Edit Name</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
