"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import AuthInput from "@/components/auth/AuthInput";
import GoogleButton from "@/components/auth/GoogleButton";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { isValidEmail } from "@/lib/auth-validation";

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

type Field = "email" | "password";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): Partial<Record<Field, string>> {
    const next: Partial<Record<Field, string>> = {};
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (password.length === 0) next.password = "Enter your password.";
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setFormError(signInError.message);
      return;
    }
    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
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

  return (
    <AuthShell
      eyebrow="AutoMod AI"
      title="Welcome back."
      subtitle="Log in to see your saved cars and builds."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <a className="font-medium text-amber-400 hover:text-amber-300" href="/register">
            Create one
          </a>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
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
        <AuthInput
          id="password"
          label="Password"
          type="password"
          icon={LockIcon}
          autoComplete="current-password"
          error={errors.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {formError && <p className="text-sm text-red-400">{formError}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {loading ? "Logging in…" : "Log in"}
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

function LoginFallback() {
  return (
    <AuthShell
      eyebrow="AutoMod AI"
      title="Welcome back."
      subtitle="Log in to see your saved cars and builds."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <a className="font-medium text-amber-400 hover:text-amber-300" href="/register">
            Create one
          </a>
        </>
      }
    >
      <p className="text-center text-sm text-neutral-400">Loading…</p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
