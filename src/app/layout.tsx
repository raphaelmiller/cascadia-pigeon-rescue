import './globals.css';
import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Cascadia Pigeon Rescue · Operations',
  description: 'Internal rescue operations management for Cascadia Pigeon Rescue.',
  applicationName: 'CPR Ops',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-24 md:pb-0">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-8">{children}</main>
      </body>
    </html>
  );
}
