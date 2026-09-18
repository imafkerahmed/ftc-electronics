'use client';

import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, KeyRound, Lock, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyManagerPinAction, getEligibleManagersAction } from '@/app/actions/admin';

interface ManagerAccount {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

interface ManagerPinModalProps {
  title?: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string, managerName?: string, managerId?: string) => void;
}

export default function ManagerPinModal({
  title = 'Manager Authorization Required',
  description = 'Please select a manager and enter their PIN to authorize this action.',
  isOpen,
  onClose,
  onSuccess,
}: ManagerPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [managers, setManagers] = useState<ManagerAccount[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      getEligibleManagersAction()
        .then((res) => {
          if (res.success && res.data && res.data.length > 0) {
            setManagers(res.data);
            setSelectedManagerId(res.data[0].id);
          }
        })
        .catch(() => {
          // ignore background load errors
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setError('Please enter Manager PIN');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const res = await verifyManagerPinAction(pin.trim(), selectedManagerId || undefined);
      if (res.success) {
        onSuccess(pin.trim(), res.managerName, selectedManagerId || undefined);
        setPin('');
      } else {
        setError(res.error || 'Invalid Manager PIN');
      }
    } catch {
      setError('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xs p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-amber-500">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">Authorization</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-center mb-4">
          <h3 className="text-base font-extrabold text-foreground tracking-tight">{title}</h3>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{description}</p>
        </div>

        {/* Manager Selector if multiple available */}
        {managers.length > 1 && (
          <div className="mb-3 space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">
              Approving Manager
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {managers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedManagerId(m.id);
                    setError('');
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all flex items-center gap-1 ${
                    selectedManagerId === m.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-500'
                      : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UserCheck className="h-3 w-3" />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display masked dots */}
          <div className="flex justify-center items-center gap-2 my-2 py-2">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`h-3.5 w-3.5 rounded-full transition-all border ${
                  idx < pin.length
                    ? 'bg-blue-500 border-blue-500 scale-110 shadow-xs shadow-blue-500/50'
                    : 'border-muted-foreground/30 bg-muted/40'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-[11px] text-red-500 font-medium text-center bg-red-500/10 border border-red-500/20 py-1 px-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeyPress(digit)}
                className="h-11 rounded-xl bg-muted/50 hover:bg-muted font-mono font-bold text-base text-foreground transition-colors flex items-center justify-center"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl bg-muted/30 hover:bg-muted/60 text-xs font-semibold text-muted-foreground transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-11 rounded-xl bg-muted/50 hover:bg-muted font-mono font-bold text-base text-foreground transition-colors flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl bg-muted/30 hover:bg-muted/60 text-xs font-semibold text-muted-foreground transition-colors"
            >
              ⌫
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 text-xs">
              Cancel
            </Button>
            <Button type="submit" disabled={verifying || !pin} className="flex-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white">
              {verifying ? 'Verifying…' : 'Authorize'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
