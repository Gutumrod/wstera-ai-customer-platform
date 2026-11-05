import LoginForm from "../ui/login-form.js";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <main className="shell login-shell">
    <section className="login-card">
      <span className="env-tag">พื้นที่ทดสอบ</span>
      <h1>เข้าสู่ระบบจัดการความรู้</h1>
      <p className="muted">กรอกอีเมลและรหัสผ่านของร้านเพื่อจัดการเอกสารที่ AI ใช้ตอบลูกค้า</p>
      <LoginForm />
    </section>
  </main>;
}
