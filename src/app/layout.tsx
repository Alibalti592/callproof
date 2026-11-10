import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallProof — verified trade-call records",
  description: "Every call timestamped, graded against the market, never deleted.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {process.env.CALLPROOF_DEV_AUTH === "1" && (
          <div className="devbar">Development mode: Whop sign-in is bypassed. Never deploy with CALLPROOF_DEV_AUTH=1.</div>
        )}
        {children}
      </body>
    </html>
  );
}
