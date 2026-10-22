import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "WSTERA • Knowledge desk",
  description: "Local synthetic knowledge upload and review console.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
