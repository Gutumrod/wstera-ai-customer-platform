"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Handoff = {
  conversationId: string;
  status: "handoff_requested" | "human_active";
  reason: string | null;
  assignedStaffId: string | null;
  updatedAt: string;
  lastCustomerMessage: string | null;
};
type Message = { id: string; role: "customer" | "bot" | "staff"; text: string; createdAt: string };

function relativeTime(value: string, now: number) {
  const minutes = Math.round((new Date(value).getTime() - now) / 60_000);
  if (Math.abs(minutes) < 1) return "เมื่อสักครู่";
  const formatter = new Intl.RelativeTimeFormat("th", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function thaiError(error: unknown, fallback: string) {
  if (error instanceof Response) {
    if (error.status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการ";
    if (error.status === 404) return "ไม่พบบทสนทนานี้ อาจถูกปิดไปแล้ว";
    if (error.status === 409) return "รายการเปลี่ยนสถานะแล้ว ลองใหม่อีกครั้ง";
  }
  return fallback;
}

export default function HandoffsConsole({ currentStaffId }: { currentStaffId: string }) {
  const [items, setItems] = useState<Handoff[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const refresh = useCallback(async (conversationId: string | null = selectedRef.current) => {
    const listResponse = await fetch("/api/handoffs", { cache: "no-store" });
    if (!listResponse.ok) throw listResponse;
    const body = await listResponse.json() as { data: Handoff[] };
    setItems(body.data);
    if (!conversationId) return;
    const messageResponse = await fetch(`/api/handoffs/${encodeURIComponent(conversationId)}/messages`, { cache: "no-store" });
    if (!messageResponse.ok) throw messageResponse;
    const messageBody = await messageResponse.json() as { data: Message[] };
    if (selectedRef.current === conversationId) setMessages(messageBody.data);
  }, []);

  // เปลี่ยนเรื่อง: เคลียร์ข้อความเก่าทันที แล้วโหลดเรื่องใหม่ (polling effect ไม่ผูกกับ selected จึงไม่ตายเมื่อคลิกระหว่าง poll)
  useEffect(() => {
    setMessages([]);
    if (selected) refresh(selected).catch((reason) => setError(thaiError(reason, "โหลดข้อมูลบทสนทนาไม่ได้")));
  }, [selected, refresh]);

  useEffect(() => {
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (disposed || document.visibilityState !== "visible" || pollingRef.current) return;
      if (busyRef.current) { timeout = setTimeout(poll, 5000); return; }
      pollingRef.current = true;
      try {
        await refresh();
        setError("");
      } catch (reason) {
        if (!disposed) setError(thaiError(reason, selectedRef.current ? "โหลดข้อมูลบทสนทนาไม่ได้" : "โหลดรายการไม่ได้"));
      } finally {
        pollingRef.current = false;
        setNow(Date.now());
        if (!disposed && document.visibilityState === "visible") timeout = setTimeout(poll, 5000);
      }
    }
    function visibilityChanged() {
      if (document.visibilityState === "visible") {
        if (timeout) clearTimeout(timeout);
        void poll();
      } else if (timeout) clearTimeout(timeout);
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    void poll();
    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [refresh]);

  async function action(path: "claim" | "release" | "reply", body?: unknown) {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/handoffs/${encodeURIComponent(selected)}/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw response;
      if (path === "reply") setText("");
      await refresh(selected);
    } catch (reason) {
      setError(thaiError(reason, path === "reply" ? "ส่งคำตอบไม่ได้ กรุณาลองอีกครั้ง" : "ทำรายการไม่ได้ กรุณาลองอีกครั้ง"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const active = items.find((item) => item.conversationId === selected);
  return <main className="handoffs-shell">
    <header className="handoffs-header"><div><p className="handoffs-eyebrow">กล่องข้อความพนักงาน</p><h1>เรื่องที่รอพนักงาน</h1></div><a href="/">กลับหน้าความรู้</a></header>
    {error ? <p className="handoffs-error" role="alert">{error}</p> : null}
    <div className="handoffs-grid">
      <section className="handoffs-card" aria-labelledby="handoffs-list-title">
        <div className="handoffs-section-heading"><h2 id="handoffs-list-title">รายการ</h2><span>{items.length} เรื่อง</span></div>
        {items.length === 0 ? <p className="handoffs-empty">ยังไม่มีเรื่องที่รอพนักงาน</p> : <div className="handoffs-list">
          {items.map((item) => <button className={`handoffs-row${selected === item.conversationId ? " is-selected" : ""}`} key={item.conversationId} onClick={() => setSelected(item.conversationId)} aria-pressed={selected === item.conversationId}>
            <span className="handoffs-row-top"><strong>{item.lastCustomerMessage?.trim() || "ลูกค้ายังไม่ได้ส่งข้อความ"}</strong><span className={`handoffs-status ${item.status === "human_active" ? "is-active" : "is-waiting"}`}>{item.status === "human_active" ? "พนักงานกำลังดูแล" : "รอรับเรื่อง"}</span></span>
            <span className="handoffs-row-bottom"><span>{item.reason === "customer_requested" ? "ลูกค้าขอคุยพนักงาน" : "บอทตอบไม่ได้"}</span><time dateTime={item.updatedAt}>{relativeTime(item.updatedAt, now)}</time></span>
          </button>)}
        </div>}
      </section>
      <section className="handoffs-card handoffs-detail" aria-labelledby="handoffs-detail-title">
        <h2 id="handoffs-detail-title">{selected ? (active?.lastCustomerMessage?.trim() || "บทสนทนากับลูกค้า") : "เลือกบทสนทนา"}</h2>
        {selected ? <>
          <div className="handoffs-message-list" aria-live="polite">{messages.map((message) => <article className="handoffs-message" key={message.id}>
            <div className="handoffs-message-meta"><span>{message.role === "customer" ? "ลูกค้า" : message.role === "bot" ? "บอท" : "พนักงาน"}</span><time dateTime={message.createdAt}>{relativeTime(message.createdAt, now)}</time></div><p>{message.text}</p>
          </article>)}</div>
          <div className="handoffs-actions">
            {active?.status === "handoff_requested" ? <button disabled={busy} onClick={() => void action("claim")}>{busy ? "กำลังทำรายการ…" : "รับเรื่อง"}</button> : null}
            {active?.status === "human_active" && active.assignedStaffId === currentStaffId ? <button className="handoffs-secondary" disabled={busy} onClick={() => void action("release")}>{busy ? "กำลังทำรายการ…" : "ปล่อยคืนให้บอท"}</button> : null}
          </div>
          {active?.status === "human_active" && active.assignedStaffId === currentStaffId ? <form className="handoffs-reply" onSubmit={(event) => { event.preventDefault(); void action("reply", { text, deliveryId: crypto.randomUUID() }); }}>
            <label htmlFor="handoffs-reply-text">ข้อความตอบลูกค้า</label><textarea id="handoffs-reply-text" maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} />
            <button disabled={busy || !text.trim()}>{busy ? "กำลังส่ง…" : "ส่งคำตอบ"}</button>
          </form> : null}
        </> : <p className="handoffs-empty">เลือกรายการทางซ้ายเพื่ออ่านบทสนทนา</p>}
      </section>
    </div>
  </main>;
}
