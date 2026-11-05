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
  visibility?: "customer" | "internal";
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
type Kind = "faq" | "pdf" | "csv";

const VISIBILITY_LABEL = { customer: "ลูกค้าเห็นได้", internal: "ภายในร้าน" } as const;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SLOW_LOAD_MS = 8000;

// ป้ายสถานะภาษาไทย + โทนสี (ok = ใช้งานได้, wait = รอคนทำ/ระบบทำ, bad = มีปัญหา, off = ปิดแล้ว)
const STATUS: Record<string, readonly [string, "ok" | "wait" | "bad" | "off"]> = {
  uploaded: ["อัปโหลดแล้ว", "wait"],
  validating: ["กำลังตรวจไฟล์", "wait"],
  extracting: ["กำลังอ่านเนื้อหา", "wait"],
  indexed: ["พร้อมอนุมัติ", "wait"],
  approved: ["ใช้งานอยู่", "ok"],
  quarantined: ["ไม่ผ่านการตรวจ", "bad"],
  failed: ["ประมวลผลไม่สำเร็จ", "bad"],
  revoked: ["ถอนแล้ว", "off"],
};
function StatusBadge({ status }: Readonly<{ status: string }>) {
  const [label, tone] = STATUS[status] ?? [status, "off" as const];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

const KIND_LABEL: Record<string, string> = { faq: "คำถามที่พบบ่อย", pdf: "ไฟล์ PDF", csv: "ไฟล์ CSV" };

const ERROR_TEXT: Record<string, string> = {
  OWNER_ROLE_REQUIRED: "ต้องเป็นเจ้าของร้านเท่านั้นจึงทำรายการนี้ได้",
  INVALID_KNOWLEDGE_INPUT: "ข้อมูลที่กรอกไม่ครบหรือไม่ถูกต้อง กรุณาตรวจชื่อ เนื้อหา หรือไฟล์อีกครั้ง",
  MEMBERSHIP_REQUIRED: "บัญชีนี้ยังไม่ได้เป็นสมาชิกของร้าน กรุณาติดต่อเจ้าของร้าน",
};
function thaiError(code: unknown, fallback: string): string {
  return typeof code === "string" && ERROR_TEXT[code] ? ERROR_TEXT[code] : fallback;
}
async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; } catch { return {} as T; }
}

export default function KnowledgeConsole({ role }: Readonly<{ role: "owner" | "staff" }>) {
  const [sources, setSources] = useState<readonly SourceGroup[]>([]);
  const [quarantine, setQuarantine] = useState<readonly QuarantineItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [kind, setKind] = useState<Kind>("faq");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const uploadIdempotencyKey = useRef<string | null>(null);

  const fail = (text: string) => setMessage({ text, error: true });
  const ok = (text: string) => setMessage({ text, error: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge/sources", { cache: "no-store" });
      const payload = await readJson<{ data?: SourceGroup[]; quarantine?: QuarantineItem[]; error?: string }>(response);
      if (!response.ok) throw new Error(thaiError(payload.error, "โหลดรายการเอกสารไม่สำเร็จ ลองกด “รีเฟรช” อีกครั้ง"));
      setSources(payload.data ?? []);
      setQuarantine(payload.quarantine ?? []);
      setLoaded(true);
    } catch (error: unknown) {
      fail(error instanceof Error && error.message ? error.message : "โหลดรายการเอกสารไม่สำเร็จ ลองกด “รีเฟรช” อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // ฐานข้อมูลไกล โหลดเกิน 8 วินาทีให้บอกผู้ใช้ว่ายังทำงานอยู่
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const kindValue = String(form.get("kind"));
    const file = form.get("file");
    if (kindValue !== "faq" && file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      fail("ไฟล์ใหญ่เกินไป ต้องมีขนาดไม่เกิน 5 MB");
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
      const payload = await readJson<{ data?: Version; error?: string }>(response);
      if (!response.ok) throw new Error(thaiError(payload.error, "เพิ่มเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง"));
      const status = payload.data ? (STATUS[payload.data.status]?.[0] ?? payload.data.status) : "";
      ok(`รับเอกสารแล้ว${status ? ` · สถานะ: ${status}` : ""}${payload.data ? ` · แบ่งเป็น ${payload.data.chunkCount} ส่วน` : ""}`);
      uploadIdempotencyKey.current = null;
      formElement.reset();
      setKind("faq");
      await reload();
    } catch (error: unknown) {
      fail(error instanceof Error && error.message ? error.message : "เพิ่มเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง");
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
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(thaiError(payload.error, "อนุมัติเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง"));
      ok("อนุมัติเอกสารแล้ว AI เริ่มใช้เนื้อหานี้ได้");
      await reload();
    } catch (error: unknown) {
      fail(error instanceof Error && error.message ? error.message : "อนุมัติเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง");
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
      const payload = await readJson<{ data?: SearchResult; error?: string }>(response);
      if (!response.ok) throw new Error(thaiError(payload.error, "ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง"));
      setSearchResult(payload.data ?? null);
    } catch (error: unknown) {
      fail(error instanceof Error && error.message ? error.message : "ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง");
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
      fail("ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  return <main className="shell">
    <header className="topbar">
      <div><span className="env-tag">พื้นที่ทดสอบ</span><h1>จัดการความรู้ร้าน</h1></div>
      <div className="user-tools">
        <span className="role-chip">{role === "owner" ? "เจ้าของร้าน" : "พนักงาน"}</span>
        <a className="button-link" href="/handoffs">เรื่องที่รอพนักงาน</a>
        <button className="button-quiet" onClick={signOut}>ออกจากระบบ</button>
      </div>
    </header>
    {message && <p className={message.error ? "notice notice-error" : "notice"} role={message.error ? "alert" : "status"}>{message.text}</p>}

    <section className="grid">
      <section className="card">
        <h2>เพิ่มคำถามที่พบบ่อยหรือเอกสาร</h2>
        <form className="stack" onSubmit={upload}>
          <label>ชนิดข้อมูล<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="faq">FAQ (พิมพ์คำถามและคำตอบ)</option><option value="pdf">PDF</option><option value="csv">CSV</option></select></label>
          <label>ใครเห็นได้<select name="visibility" defaultValue="" required><option value="" disabled>เลือกว่าใครเห็นได้</option><option value="customer">ลูกค้าเห็นได้ บอทใช้ตอบลูกค้า</option><option value="internal">ภายในร้าน พนักงานเท่านั้น</option></select></label>
          <label>ชื่อเอกสาร<input name="title" required maxLength={200} /></label>
          {kind === "faq"
            ? <label>เนื้อหา FAQ<textarea name="content" rows={5} maxLength={20000} placeholder="พิมพ์คำถามและคำตอบที่ต้องการให้ AI ใช้" /></label>
            : <label>ไฟล์ {kind.toUpperCase()}<input name="file" type="file" accept={kind === "pdf" ? ".pdf,application/pdf" : ".csv,text/csv,text/plain"} /></label>}
          <p className="hint">{kind === "faq" ? "พิมพ์ได้ไม่เกิน 20,000 ตัวอักษร" : kind === "pdf" ? "ไฟล์ไม่เกิน 5 MB และไม่เกิน 100 หน้า" : "ไฟล์ไม่เกิน 5 MB ไม่เกิน 5,000 แถวและ 100 คอลัมน์"}</p>
          <button disabled={busy} aria-busy={busy}>{busy ? "กำลังตรวจและบันทึก…" : "เพิ่มเอกสารเพื่อรอตรวจ"}</button>
        </form>
      </section>

      <section className="card review-card">
        <div className="section-heading"><h2>รายการเอกสาร</h2><button className="button-quiet button-small" disabled={loading} aria-busy={loading} onClick={() => void reload()}>รีเฟรช</button></div>
        {loaded && loading && <p className="updating" role="status">กำลังอัปเดตรายการ…{slow ? " ฐานข้อมูลตอบช้ากว่าปกติ รอสักครู่" : ""}</p>}
        {!loaded ? <p className="muted" role="status">{loading ? `กำลังโหลดรายการเอกสาร…${slow ? " ฐานข้อมูลตอบช้ากว่าปกติ รอสักครู่" : ""}` : "ยังโหลดรายการไม่ได้ กดรีเฟรชเพื่อลองอีกครั้ง"}</p>
          : sources.length === 0 ? <p className="empty">ยังไม่มีเอกสารในร้านนี้ เริ่มจากเพิ่มคำถามที่พบบ่อยทางซ้าย</p> : <div className="source-list">
          {sources.map(({ source, versions }) => <article className="source" key={source.sourceId}>
            <div className="source-heading"><div><span className="kind-chip">{source.kind.toUpperCase()}</span><h3>{source.title}</h3></div></div>
            {versions.map((version) => <div className="version" key={version.versionId}>
              <div className="version-main">
                <StatusBadge status={version.status} />
                <span className={`badge ${version.visibility === "customer" ? "" : "badge-off"}`}>{version.visibility ? VISIBILITY_LABEL[version.visibility] : "ไม่ระบุ"}</span>
                <span className="muted">{version.chunkCount} ส่วน</span>
              </div>
              {version.status === "indexed" && role === "owner" && <button className="button-small" disabled={busy} aria-busy={busy} onClick={() => void approve(source.sourceId, version.versionId)}>อนุมัติ</button>}
              <details className="tech"><summary>รายละเอียดทางเทคนิค</summary><code>รหัสเวอร์ชัน: {version.versionId}</code><code>รหัสเอกสาร: {version.sourceId}</code></details>
            </div>)}
          </article>)}
        </div>}
      </section>

      {quarantine.length > 0 && <section className="card quarantine-card">
        <h2>ไฟล์ที่ไม่ผ่านการตรวจ</h2>
        <div className="source-list">{quarantine.map((item) => <article className="version" key={item.attemptId}>
          <div className="version-main"><strong>{item.title}</strong><span className="badge badge-bad">ไม่ผ่านการตรวจ</span><span className="muted">{item.filename ?? KIND_LABEL[item.kind] ?? item.kind} · {Math.max(1, Math.round(item.byteSize / 1024)).toLocaleString("th-TH")} KB</span></div>
          <details className="tech"><summary>รายละเอียดทางเทคนิค</summary><code>รหัสข้อผิดพลาด: {item.failureCode}</code></details>
        </article>)}</div>
      </section>}

      <section className="card search-card">
        <h2>ลองค้นหาจากเอกสารที่อนุมัติแล้ว</h2>
        <form className="search-form" onSubmit={search}><input aria-label="คำถามที่ต้องการลองค้นหา" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={500} required placeholder="เช่น คืนสินค้าได้ภายในกี่วัน" /><button disabled={busy} aria-busy={busy}>ค้นหา</button></form>
        {searchResult && (searchResult.kind === "no_answer" ? <p className="empty">ไม่พบคำตอบในเอกสารที่อนุมัติแล้ว</p> : <div className="hits">{searchResult.hits?.map((hit) => <article className="hit" key={hit.citation.chunkId}>
          <h3>{hit.title}</h3><p>{hit.excerpt}</p>
          <details className="tech"><summary>ดูที่มา</summary><code>รหัสเอกสาร: {hit.citation.sourceId}</code><code>รหัสเวอร์ชัน: {hit.citation.sourceVersionId}</code><code>ตำแหน่ง: {JSON.stringify(hit.citation.locator)}</code></details>
        </article>)}</div>)}
      </section>
    </section>
  </main>;
}
