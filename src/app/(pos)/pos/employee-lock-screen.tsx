'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User, Lock, Delete, ChevronRight, ShieldCheck, Loader2, KeyRound, AlertCircle } from 'lucide-react';
import type { PBEmployee, PosEmployeeSession } from '@/types/pos';
import { getPosEmployeesAction } from '@/app/actions/admin';
import { setPosSession } from '@/lib/pos-session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface EmployeeLockScreenProps {
  onUnlock: (session: PosEmployeeSession) => void;
}

export default function EmployeeLockScreen({ onUnlock }: EmployeeLockScreenProps) {
  const [employees, setEmployees] = useState<PBEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PBEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    const res = await getPosEmployeesAction();
    if (res.success && res.data) {
      setEmployees(res.data as PBEmployee[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const handlePinDigit = useCallback((digit: string) => {
    if (pin.length >= 6) return;
    setPin((p) => p + digit);
    setError('');
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError('');
  }, []);

  const handleVerify = useCallback(() => {
    if (!selected) return;
    if (pin === selected.pin) {
      const session: PosEmployeeSession = {
        id: selected.id,
        name: selected.name,
        role: selected.role,
        loginTime: new Date().toISOString(),
      };
      setPosSession(session);
      onUnlock(session);
    } else {
      setShaking(true);
      setError('Incorrect PIN. Try again.');
      setPin('');
      setTimeout(() => setShaking(false), 600);
    }
  }, [selected, pin, onUnlock]);

  // Allow physical keyboard entry
  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinDigit(e.key);
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === 'Enter' && pin.length >= 4) handleVerify();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, pin, handlePinDigit, handleBackspace, handleVerify]);

  const roleBadgeColor = (role: string) =>
    role === 'manager'
      ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      : 'text-blue-500 bg-blue-500/10 border-blue-500/20';

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background text-foreground font-sans overflow-hidden">
      {/* Dynamic glow background matching admin login */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] -z-10" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

      {/* Grid Pattern mask matching admin login */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)] -z-10" />

      <Card className="w-full max-w-md border border-border bg-card/60 backdrop-blur-xl shadow-2xl relative">
        {/* Glow Bar on Top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <CardHeader className="space-y-2 text-center pt-8">
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center mb-1">
            {selected ? <KeyRound className="h-6 w-6 text-blue-500" /> : <ShieldCheck className="h-6 w-6 text-blue-500" />}
          </div>
          <CardTitle className="text-2xl font-bold tracking-wide">POS Terminal</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {selected ? `Signing in as ${selected.name}` : 'Select an authorized employee to sign in'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-2">
          {!selected ? (
            /* ── Employee Picker ── */
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                </div>
              ) : employees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs space-y-1">
                  <p>No system users found.</p>
                  <p className="text-[11px] opacity-70">Add staff accounts in Admin → System Configurations → POS Employees.</p>
                </div>
              ) : (
                employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => { setSelected(emp); setPin(''); setError(''); }}
                    className="w-full flex items-center gap-3.5 p-3.5 bg-background/50 hover:bg-muted/40 border border-border/80 hover:border-blue-500/40 rounded-xl transition-all duration-200 group cursor-pointer"
                  >
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-border flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-foreground">{initials(emp.name)}</span>
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{emp.name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadgeColor(emp.role)} capitalize`}>
                        {emp.role}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                  </button>
                ))
              )}
            </div>
          ) : (
            /* ── PIN Entry ── */
            <div className={`space-y-5 ${shaking ? 'animate-shake' : ''}`}>
              {/* Selected user badge */}
              <button
                onClick={() => { setSelected(null); setPin(''); setError(''); }}
                className="w-full flex items-center gap-3 p-3 bg-background/60 border border-border rounded-xl cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-foreground">{initials(selected.name)}</span>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{selected.name}</p>
                  <p className="text-[10px] text-muted-foreground">Tap to switch user</p>
                </div>
                <User className="h-4 w-4 text-muted-foreground" />
              </button>

              {/* PIN dots */}
              <div className="flex justify-center gap-3 py-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-3 w-3 rounded-full transition-all duration-150 ${
                      i < pin.length ? 'bg-blue-500 scale-110 shadow-sm shadow-blue-500/50' : 'bg-muted border border-border'
                    }`}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Numeric keypad styled like admin buttons */}
              <div className="grid grid-cols-3 gap-2.5">
                {['1','2','3','4','5','6','7','8','9','empty','0','backspace'].map((k) => (
                  k === 'empty' ? (
                    <div key="empty" />
                  ) : k === 'backspace' ? (
                    <button
                      key="backspace"
                      type="button"
                      onClick={handleBackspace}
                      className="h-12 rounded-xl bg-muted/50 hover:bg-muted border border-border flex items-center justify-center text-foreground transition-all cursor-pointer active:scale-95"
                    >
                      <Delete className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      key={`num-${k}`}
                      type="button"
                      onClick={() => handlePinDigit(k)}
                      className="h-12 rounded-xl bg-background/80 hover:bg-blue-500/10 hover:border-blue-500/40 border border-border text-foreground font-bold text-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
                    >
                      {k}
                    </button>
                  )
                ))}
              </div>

              {/* Unlock button */}
              <Button
                onClick={handleVerify}
                disabled={pin.length < 4}
                className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
              >
                <Lock className="h-4 w-4" />
                Unlock POS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
