import LoginForm from "../ui/login-form.js";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <main className="shell login-shell">
    <section className="login-card">
      <p className="eyebrow">WSTERA · LOCAL SYNTHETIC</p>
      <h1>เข้าสู่ Knowledge Desk</h1>
      <p className="muted">ใช้บัญชี local ที่สร้างด้วย `npm run seed:local`</p>
      <LoginForm />
    </section>
  </main>;
}
