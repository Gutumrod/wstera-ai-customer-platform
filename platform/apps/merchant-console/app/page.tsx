import { redirect } from "next/navigation";
import { MerchantIdentityError, requireMerchantIdentity } from "../lib/identity.js";
import KnowledgeConsole from "./ui/knowledge-console.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const { identity } = await requireMerchantIdentity();
    return <KnowledgeConsole role={identity.role} />;
  } catch (error: unknown) {
    if (error instanceof MerchantIdentityError && error.code === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof MerchantIdentityError) {
      return <main className="shell"><section className="card"><p className="eyebrow">ACCESS DENIED</p><h1>ยังไม่มีสิทธิ์เข้า workspace นี้</h1><p>บัญชีนี้ไม่มี workspace และ web connection ที่เปิดใช้งานอยู่</p></section></main>;
    }
    throw error;
  }
}
