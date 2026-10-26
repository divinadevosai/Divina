import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  // the extension is every new tab, so it's called what a new tab is called
  title: process.env.NEXT_PUBLIC_DIVINA_PLATFORM === 'extension' ? 'New Tab' : 'Divina: a free 3D AI assistant you talk to',
  description: 'A spatial OS for your day: live cards in a 3D room you control by voice, hands or keyboard.',
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
  // draw under the notch and home bar; the HUD keeps clear of them itself
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
