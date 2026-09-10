'use client';

import { useId, useState } from 'react';

export default function AuthTextField({
  value, onChange, placeholder, label, type = 'text', autoComplete, onSubmit, visibleLabel,
}: {
  visibleLabel?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  type?: string;
  autoComplete?: string;
  onSubmit?: () => void;
}) {
  const inputId = useId();
  const [revealed, setRevealed] = useState(false);
  const secret = type === 'password';
  return (
    <>
    {visibleLabel && <label className="gb-auth-v2-label" htmlFor={inputId}>{visibleLabel}</label>}
    <div className="gb-auth-field-shell">
    <span className={`gb-auth-field-icon ${secret ? 'gb-auth-icon-lock' : 'gb-auth-icon-user'}`} aria-hidden="true" />
    <input
      id={inputId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && onSubmit) onSubmit(); }}
      type={secret && revealed ? 'text' : type}
      placeholder={placeholder}
      autoComplete={autoComplete}
      aria-label={label}
      maxLength={128}
      className="gb-auth-text-field min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-emerald-400"
    />
    {secret && <button type="button" className="gb-auth-password-toggle" aria-label={revealed ? `隐藏${label}` : `显示${label}`} aria-pressed={revealed} onClick={() => setRevealed(!revealed)}><span className={`gb-auth-icon-eye ${revealed ? 'is-revealed' : ''}`} aria-hidden="true" /></button>}
    </div>
    </>
  );
}
