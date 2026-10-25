"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Version = Readonly<{
  sourceId: string;
  versionId: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  chunkCount: number;
}>;
type SourceGroup = Readonly<{
  source: Readonly<{ sourceId: string; title: string; kind: string; status: string; createdAt: string }>;
  versions: readonly Version[];
}>;
type QuarantineItem = Readonly<{ attemptId: string; kind: string; title: string; filename?: string; byteSize: number; failureCode: string; createdAt: string }>;
type SearchResult = Readonly<{
  kind: "no_answer" | "evidence";
  reason?: string;
  hits?: readonly Readonly<{
    title: string;
    excerpt: string;
    score: number;
    citation: Readonly<{ sourceId: string; sourceVersionId: string; chunkId: string; locator: unknown }>;
  }>[];
}>;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export default function KnowledgeConsole({ role }: Readonly<{ role: "owner" | "staff" }>) {
  const [sources, setSources] = useState<readonly SourceGroup[]>([]);
  const [quarantine, setQuarantine] = useState<readonly QuarantineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const uploadIdempotencyKey = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge/sources", { cache: "no-store" });
      const payload = await response.json() as { data?: SourceGroup[]; quarantine?: QuarantineItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "โหลด source ไม่สำเร็จ");
      setSources(payload.data ?? []);
      setQuarantine(payload.quarantine ?? []);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "โหลด source ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const kind = String(form.get("kind"));
    const file = form.get("file");
    if (kind !== "faq" && file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      setMessage("ไฟล์ต้องมีขนาดไม่เกิน 5 MiB");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/knowledge/sources", {
        method: "POST",
        headers: { "idempotency-key": uploadIdempotencyKey.current ?? (uploadIdempotencyKey.current = crypto.randomUUID()) },
        body: form,
      });
      const payload = await response.json() as { data?: Version; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "นำเข้า source ไม่สำเร็จ");
      setMessage(`รับข้อมูลแล้ว: ${payload.data?.status} · ${payload.data?.chunkCount} chunks`);
      uploadIdempotencyKey.current = null;
      formElement.reset();
      await reload();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "นำเข้า source ไม่สำเร็จ");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function approve(sourceId: string, versionId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/knowledge/sources/${encodeURIComponent(sourceId)}/versions/${encodeURIComponent(versionId)}/approve`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "อนุมัติ source ไม่สำเร็จ");
      setMessage("อนุมัติ source version แล้ว");
      await reload();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "อนุมัติ source ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSearchResult(null);
    try {
      const response = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const payload = await response.json() as { data?: SearchResult; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "ค้นหาไม่สำเร็จ");
      setSearchResult(payload.data ?? null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      const { createSupabaseBrowserClient } = await import("../../lib/supabase/browser.js");
      await (await createSupabaseBrowserClient()).auth.signOut();
      window.location.assign("/login");
    } catch {
      setMessage("ออกจากระบบไม่สำเร็จ");
    }
  }

  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">WSTERA · LOCAL SYNTHETIC</p><h1>Knowledge Desk</h1></div>
      <div className="user-tools"><span className="role-chip">{role}</span><button className="button-quiet" onClick={signOut}>ออกจากระบบ</button></div>
    </header>
    {message && <p className="notice" role="status">{message}</p>}

    <section className="grid">
      <section className="card">
        <p className="eyebrow">01 / KNOWLEDGE INTAKE</p><h2>เพิ่ม FAQ หรือเอกสาร</h2>
        <form className="stack" onSubmit={upload}>
          <label>ชนิดข้อมูล<select name="kind" defaultValue="faq"><option value="faq">FAQ</option><option value="pdf">PDF</option><option value="csv">CSV</option></select></label>
          <label>ชื่อ source<input name="title" required maxLength={200} /></label>
          <label>เนื้อหา FAQ<textarea name="content" rows={5} maxLength={20000} placeholder="ใช้เมื่อเลือก FAQ" /></label>
          <label>ไฟล์ PDF/CSV<input name="file" type="file" accept=".pdf,.csv,application/pdf,text/csv,text/plain" /></label>
          <p className="hint">จำกัด 5 MiB/ไฟล์ · PDF ไม่เกิน 100 หน้า · CSV ไม่เกิน 5,000 แถวและ 100 คอลัมน์</p>
          <button disabled={busy}>{busy ? "กำลังตรวจสอบและจัดทำดัชนี…" : "เพิ่มเข้า review queue"}</button>
        </form>
      </section>

      <section className="card review-card">
        <div className="section-heading"><div><p className="eyebrow">02 / REVIEW</p><h2>รายการ source</h2></div><button className="button-quiet" disabled={loading} onClick={() => void reload()}>รีเฟรช</button></div>
        {loading ? <p className="muted">กำลังโหลด…</p> : sources.length === 0 ? <p className="empty">ยังไม่มี source ใน workspace นี้</p> : <div className="source-list">
          {sources.map(({ source, versions }) => <article className="source" key={source.sourceId}>
            <div className="source-heading"><div><span className="kind-chip">{source.kind}</span><h3>{source.title}</h3></div><span className="muted">{source.status}</span></div>
            {versions.map((version) => <div className="version" key={version.versionId}>
              <div><strong>{version.status}</strong><span className="muted"> · {version.chunkCount} chunks</span><small>{version.versionId}</small></div>
              {version.status === "indexed" && role === "owner" && <button className="button-small" disabled={busy} onClick={() => void approve(source.sourceId, version.versionId)}>อนุมัติ</button>}
            </div>)}
          </article>)}
        </div>}
      </section>

      {quarantine.length > 0 && <section className="card quarantine-card">
        <p className="eyebrow">QUARANTINE</p><h2>ไฟล์ที่ไม่ผ่านการตรวจ</h2>
        <div className="source-list">{quarantine.map((item) => <article className="version" key={item.attemptId}>
          <div><strong>{item.title}</strong><span className="muted"> · {item.filename ?? item.kind} · {item.byteSize.toLocaleString()} bytes</span><small>{item.failureCode}</small></div>
          <span className="kind-chip">quarantined</span>
        </article>)}</div>
      </section>}

      <section className="card search-card">
        <p className="eyebrow">03 / SOURCE TRACE</p><h2>ลองค้นหา knowledge ที่อนุมัติแล้ว</h2>
        <form className="search-form" onSubmit={search}><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={500} required placeholder="เช่น คืนสินค้าได้ภายในกี่วัน" /><button disabled={busy}>ค้นหา</button></form>
        {searchResult && (searchResult.kind === "no_answer" ? <p className="empty">ไม่พบหลักฐานจาก source ที่อนุมัติ</p> : <div className="hits">{searchResult.hits?.map((hit) => <article className="hit" key={hit.citation.chunkId}>
          <h3>{hit.title}</h3><p>{hit.excerpt}</p><code>{hit.citation.sourceId} / {hit.citation.sourceVersionId} / {JSON.stringify(hit.citation.locator)}</code>
        </article>)}</div>)}
      </section>
    </section>
  </main>;
}
