import type { Metadata, Viewport } from "next";
import { Lexend, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", weight: ["400", "500", "600", "700"] });
const body = Source_Sans_3({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Filoi Ops", template: "%s · Filoi Ops" },
  description: "Proposals, projects and billing for Filoi Private Limited",
  icons: { icon: "/filoi-logo.png" },
};
export const viewport: Viewport = { themeColor: "#0f2550", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
