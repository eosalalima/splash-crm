import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Splash CRM — Make room for growth",
    template: "%s | Splash CRM",
  },
  description:
    "A calmer workspace for your people, companies, and opportunities.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
