import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "WSTERA • จัดการความรู้ร้าน",
  description: "หน้าจัดการเอกสารและคำตอบที่ AI ใช้ตอบลูกค้า สำหรับเจ้าของร้านและพนักงาน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
