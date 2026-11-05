import { redirect } from "next/navigation";
import { MerchantIdentityError, requireMerchantIdentity } from "../../lib/identity.js";
import HandoffsConsole from "../ui/handoffs-console.js";
import "./handoffs.css";

export const dynamic = "force-dynamic";

export default async function HandoffsPage() {
  try {
    const { identity } = await requireMerchantIdentity();
    return <HandoffsConsole currentStaffId={identity.userId} />;
  } catch (error) {
    if (error instanceof MerchantIdentityError && error.code === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof MerchantIdentityError) return <main className="shell"><section className="card"><h1>ไม่มีสิทธิ์เข้าถึง</h1></section></main>;
    throw error;
  }
}
