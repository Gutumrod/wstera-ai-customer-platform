"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser.js";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const client = createSupabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithPassword({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (authError) throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      router.replace("/");
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack" onSubmit={submit}>
    <label>อีเมล<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label>รหัสผ่าน<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}</button>
  </form>;
}
