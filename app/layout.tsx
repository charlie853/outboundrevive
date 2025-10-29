import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import SiteFooter from "./components/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'),
  title: { default: 'OutboundRevive', template: '%s | OutboundRevive' },
  description: 'AI SMS that revives cold leads and books time — hands off.',
  alternates: { canonical: '/' },
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'OutboundRevive',
    description: 'AI SMS that revives cold leads and books time — hands off.',
    url: '/',
    siteName: 'OutboundRevive',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OutboundRevive',
    description: 'AI SMS that revives cold leads and books time — hands off.'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-grid bg-indigo-900`}
      >
        <AuthProvider>
          {children}
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
