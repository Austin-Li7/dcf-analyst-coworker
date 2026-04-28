import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCF Valuation Tool",
  description: "Modular DCF toolkit: Cash Flow Projector + Discount Rate (WACC)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-zinc-950 font-sans text-zinc-100">
        {children}
      </body>
    </html>
  );
}
