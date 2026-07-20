'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Users, Plus, Pencil, Trash2, Save, X,
  CheckCircle2, AlertCircle, Loader2, ShieldCheck, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getPosEmployeesAdminAction,
  createPosEmployeeAction,
  updatePosEmployeeAction,
  deletePosEmployeeAction,
} from '@/app/actions/admin';
import type { PBEmployee, EmployeeRole } from '@/types/pos';

interface EmployeeForm {
  name: string;
  pin: string;
  role: EmployeeRole;
  isActive: boolean;
}

const blankForm: EmployeeForm = { name: '', pin: '', role: 'cashier', isActive: true };

export default function EmployeesConfigPage() {
  const [employees, setEmployees] = useState<PBEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [editing, setEditing] = useState<PBEmployee | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(blankForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPosEmployeesAdminAction();
    if (res.success && res.data) setEmployees(res.data as PBEmployee[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setAdding(true); setEditing(null); setForm(blankForm); };
  const openEdit = (emp: PBEmployee) => { setEditing(emp); setAdding(false); setForm({ name: emp.name, pin: emp.pin, role: emp.role, isActive: emp.isActive }); };
  const closeForm = () => { setAdding(false); setEditing(null); setForm(blankForm); };

  const validatePin = (p: string) => /^\d{4,6}$/.test(p);

  const handleSave = () => {
    if (!form.name.trim()) return showToast('Name is required.', 'error');
    if (!validatePin(form.pin)) return showToast('PIN must be 4–6 digits.', 'error');

    startTransition(async () => {
      if (editing) {
        const res = await updatePosEmployeeAction(editing.id, form);
        if (res.success) { showToast('Employee updated!'); closeForm(); await load(); }
        else showToast(res.error || 'Update failed.', 'error');
      } else {
        const res = await createPosEmployeeAction(form);
        if (res.success) { showToast('Employee created!'); closeForm(); await load(); }
        else showToast(res.error || 'Create failed.', 'error');
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deletePosEmployeeAction(id);
      if (res.success) { showToast('Employee removed.'); setDeleteConfirm(null); await load(); }
      else showToast(res.error || 'Delete failed.', 'error');
    });
  };

  const roleColor = (role: EmployeeRole) =>
    role === 'manager'
      ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      : 'text-blue-500 bg-blue-500/10 border-blue-500/20';

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl pb-16">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border pb-5">
        <Link href="/admin/system-config" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 group transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to System Configurations
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-indigo-500/10 rounded-xl flex items-center justify-center">
              <Users className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">POS Employees</h1>
              <p className="text-xs text-muted-foreground">Manage cashier and manager accounts for the POS system.</p>
            </div>
          </div>
          {!adding && !editing && (
            <Button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* Add / Edit form */}
      {(adding || editing) && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{editing ? 'Edit Employee' : 'New Employee'}</h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Full Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ahmad Rashid"
                className="h-8.5 text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">PIN (4–6 digits)</label>
              <Input
                type="password"
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="e.g. 1234"
                className="h-8.5 text-xs font-mono"
                maxLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as EmployeeRole }))}
                className="w-full h-8.5 px-3 rounded-lg border border-border bg-background text-xs font-medium focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${form.isActive ? 'bg-indigo-600' : 'bg-muted'}`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform duration-200 shadow ${form.isActive ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-foreground/80">Active (can use POS)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {editing ? 'Save Changes' : 'Create Employee'}
            </Button>
            <Button variant="outline" onClick={closeForm} className="text-xs h-8 px-4 cursor-pointer">Cancel</Button>
          </div>
        </div>
      )}

      {/* Employee list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading employees…
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No employees yet</p>
            <p className="text-xs text-muted-foreground/60">Add cashiers so they can log into the POS system.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-foreground">{initials(emp.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{emp.name}</p>
                    {!emp.isActive && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">INACTIVE</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleColor(emp.role)} capitalize`}>
                    {emp.role === 'manager' ? <><ShieldCheck className="h-2.5 w-2.5 inline mr-0.5" />Manager</> : <><User className="h-2.5 w-2.5 inline mr-0.5" />Cashier</>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEdit(emp)}
                    className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {deleteConfirm === emp.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(emp.id)}
                        disabled={isPending}
                        className="h-7 px-2 rounded-lg bg-red-500 text-white text-[10px] font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                      <button onClick={() => setDeleteConfirm(null)} className="h-7 px-2 rounded-lg border border-border text-[10px] cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(emp.id)}
                      className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-600/80 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> How POS Login Works</p>
        <p>Employees select their name on the POS lock screen and enter their PIN to sign in. Sessions last 8 hours before requiring re-login.</p>
        <p>PINs must be 4–6 numeric digits. Keep them confidential.</p>
      </div>
    </div>
  );
}
