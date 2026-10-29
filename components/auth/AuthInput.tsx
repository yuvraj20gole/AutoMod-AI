"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

export default function AuthInput({
  label,
  id,
  icon,
  error,
  className = "",
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  icon?: ReactNode;
  error?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const errorId = useId();
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-neutral-300" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={inputType}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-xl border bg-white/[0.03] py-2.5 text-sm text-neutral-50 outline-none transition-colors placeholder:text-neutral-500 ${
            icon ? "pl-10" : "pl-4"
          } ${isPassword ? "pr-10" : "pr-4"} ${
            error
              ? "border-red-400/60 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
              : "border-white/15 focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/20"
          } ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-neutral-300"
            aria-label={reveal ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {reveal ? (
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.4 9.4 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.3 3.5M6.2 6.6C4.3 8 3.1 9.9 2 12c1 2.5 5 7 10 7 1.4 0 2.7-.3 3.9-.9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
