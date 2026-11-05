"use client";

import { useCallback, useEffect, useState } from "react";

type Handoff = { conversationId: string; status: string; reason: string | null; assignedStaffId: string | null; updatedAt: string };
type Message = { id: string; role: "customer" | "bot" | "staff"; text: string; createdAt: string };

export default function HandoffsConsole() {
  const [items, setItems] = useState<Handoff[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/handoffs", { cache: "no-store" });
    if (!response.ok) throw new Error("โหลดรายการไม่ได้");
    const body = await response.json() as { data: Handoff[] };
    setItems(body.data);
  }, []);
  useEffect(() => { void refresh().catch(() => setError("โหลดรายการไม่ได้")); }, [refresh]);
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let active = true;
    void fetch(`/api/handoffs/${encodeURIComponent(selected)}/messages`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: Message[] }>; })
      .then((body) => { if (active) setMessages(body.data); })
      .catch(() => { if (active) setError("โหลดข้อความไม่ได้"); });
    return () => { active = false; };
  }, [selected]);
  async function action(path: string, body?: unknown) {
    if (!selected) return;
    setError("");
    const response = await fetch(`/api/handoffs/${encodeURIComponent(selected)}/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) { setError(response.status === 409 ? "รายการเปลี่ยนสถานะแล้ว ลองโหลดใหม่" : "ทำรายการไม่สำเร็จ"); return; }
    if (path === "reply") setText("");
    await refresh();
    const result = await fetch(`/api/handoffs/${encodeURIComponent(selected)}/messages`, { cache: "no-store" });
    if (result.ok) setMessages((await result.json() as { data: Message[] }).data);
  }
  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">STAFF INBOX</p><h1>เรื่องที่รอพนักงาน</h1></div><a href="/">กลับหน้าความรู้</a></header>
    {error ? <p role="alert">{error}</p> : null}
    <div className="grid">
      <section className="card"><h2>รายการ</h2>{items.length === 0 ? <p>ยังไม่มีเรื่องที่รอ</p> : items.map((item) => <button className="source-row" key={item.conversationId} onClick={() => setSelected(item.conversationId)}>
        <strong>{item.conversationId}</strong><span>{item.status === "human_active" ? "พนักงานรับแล้ว" : "รอรับเรื่อง"}</span><small>{new Date(item.updatedAt).toLocaleString("th-TH")}</small>
      </button>)}</section>
      <section className="card"><h2>{selected ?? "เลือกบทสนทนา"}</h2>
        {selected ? <><div className="message-list">{messages.map((message) => <article key={message.id}><small>{message.role}</small><p>{message.text}</p></article>)}</div>
          <div className="actions"><button onClick={() => void action("claim")}>รับเรื่อง</button><button onClick={() => void action("release")}>ปล่อยคืนให้ AI</button></div>
          <form onSubmit={(event) => { event.preventDefault(); void action("reply", { text, deliveryId: crypto.randomUUID() }); }}>
            <textarea maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} aria-label="ข้อความตอบลูกค้า" />
            <button disabled={!text.trim()}>ส่งคำตอบ</button>
          </form></> : <p>เลือกเรื่องจากรายการเพื่ออ่านและตอบ</p>}
      </section>
    </div>
  </main>;
}
