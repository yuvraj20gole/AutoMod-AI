"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/Button";

export default function EditProfileForm({
  userId,
  initialName,
  email,
}: {
  userId: string;
  initialName: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Two copies of the name exist by design: auth.users' metadata (what
    // the sidebar/greeting already read) and the profiles row (the
    // longer-term source of truth). Keep both in sync on every save.
    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });
    if (authError) {
      setSaving(false);
      setError(authError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", userId);

    setSaving(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="w-full max-w-sm rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Email</label>
        <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-500">
          {email}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">Saved.</p>}

      <div>
        <Button
          type="submit"
          disabled={saving}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
