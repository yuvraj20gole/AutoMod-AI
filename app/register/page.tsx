"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import AuthInput from "@/components/auth/AuthInput";
import GoogleButton from "@/components/auth/GoogleButton";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { isValidEmail, PASSWORD_RULES, isPasswordValid } from "@/lib/auth-validation";

const UserIcon = (
  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </svg>
);
const MailIcon = (
  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
const LockIcon = (
  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

type Field = "name" | "email" | "password" | "confirmPassword";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  function validate(): Partial<Record<Field, string>> {
    const next: Partial<Record<Field, string>> = {};
    if (name.trim().length < 2) next.name = "Enter your name.";
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (!isPasswordValid(password)) next.password = "Password doesn't meet the requirements below.";
    if (confirmPassword !== password) next.confirmPassword = "Passwords don't match.";
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    if (!isSupabaseConfigured) {
      setFormError("Supabase isn't connected yet — add your project keys to .env.local.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setFormError(signUpError.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setCheckEmail(true);
  }

  async function handleGoogle() {
    setFormError(null);
    if (!isSupabaseConfigured) {
      setFormError("Supabase isn't connected yet — add your project keys to .env.local.");
      return;
    }
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setFormError(oauthError.message);
  }

  if (checkEmail) {
    return (
      <AuthShell
        eyebrow="AutoMod AI"
        title="Check your inbox."
        subtitle={`We sent a confirmation link to ${email}.`}
        footer={
          <>
            Already confirmed?{" "}
            <a className="font-medium text-amber-400 hover:text-amber-300" href="/login">
              Log in
            </a>
          </>
        }
      >
        <p className="text-center text-sm text-neutral-400">
          Click the link in that email to activate your account, then come
          back and log in.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="AutoMod AI"
      title="Create your account."
      subtitle="Save your cars and builds — free."
      footer={
        <>
          Already have an account?{" "}
          <a className="font-medium text-amber-400 hover:text-amber-300" href="/login">
            Log in
          </a>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <AuthInput
          id="name"
          label="Name"
          type="text"
          icon={UserIcon}
          autoComplete="name"
          error={errors.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <AuthInput
          id="email"
          label="Email"
          type="email"
          icon={MailIcon}
          autoComplete="email"
          error={errors.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <AuthInput
            id="password"
            label="Password"
            type="password"
            icon={LockIcon}
            autoComplete="new-password"
            error={errors.password}
            value={password}
            onFocus={() => setPasswordTouched(true)}
            onChange={(e) => setPassword(e.target.value)}
          />
          {(passwordTouched || password.length > 0) && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li
                    key={rule.key}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      met ? "text-emerald-400" : "text-neutral-500"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      {met ? <path d="M20 6 9 17l-5-5" /> : <path d="M6 6l12 12M18 6 6 18" />}
                    </svg>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <AuthInput
          id="confirmPassword"
          label="Confirm password"
          type="password"
          icon={LockIcon}
          autoComplete="new-password"
          error={errors.confirmPassword}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {formError && <p className="text-sm text-red-400">{formError}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs uppercase tracking-widest text-neutral-500">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <GoogleButton onClick={handleGoogle} disabled={loading} />
    </AuthShell>
  );
}
