// Created by MEHDI HMIDI

import type { Metadata, Viewport } from 'next';
import {
  Inter,
  Atkinson_Hyperlegible,
  UnifrakturCook,
  Cinzel,
  Share_Tech_Mono,
  Orbitron,
  Bebas_Neue,
  Varela_Round,
  Fira_Sans,
  Quantico,
  Roboto_Slab,
  Work_Sans,
  Oswald,
  IBM_Plex_Sans,
} from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from '@/components/providers/app-providers';
import { AuthProvider } from '@/contexts/AuthContext';
import { ArchiveProvider } from '@/contexts/ArchiveContext';
import ChatWidget from '@/components/business/chat-widget';
import {
  getSavedLanguage,
  getTranslations,
  type LanguageCode,
} from '@/lib/translations';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const dyslexic = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-dyslexic',
});

const warhammerFont = UnifrakturCook({
  weight: '700',
  subsets: ['latin'],
  variable: '--font-warhammer',
});

const duneFont = Cinzel({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-dune',
});

const matrixFont = Share_Tech_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-matrix',
});

const tronFont = Orbitron({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-tron',
});

const bladeRunnerFont = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-blade',
});

const walleFont = Varela_Round({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-walle',
});

const wesAndersonFont = Fira_Sans({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-wesanderson',
});

const evangelionFont = Quantico({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-evangelion',
});

const westworldFont = Roboto_Slab({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-westworld',
});

const severanceFont = Work_Sans({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-severance',
});

const fringeFont = Oswald({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-fringe',
});

const helixFont = IBM_Plex_Sans({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-helix',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: 'Sovereign',
  description: 'Conversational AI for deep understanding.',
  manifest: '/manifest.json',
  icons: {
    icon: '/ravenyr.ico',
    apple: '/ravenyr.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = getSavedLanguage();
  const t = getTranslations(lang);
  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${dyslexic.variable} ${warhammerFont.variable} ${duneFont.variable} ${matrixFont.variable} ${tronFont.variable} ${bladeRunnerFont.variable} ${walleFont.variable} ${wesAndersonFont.variable} ${evangelionFont.variable} ${westworldFont.variable} ${severanceFont.variable} ${fringeFont.variable} ${helixFont.variable} font-sans antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only absolute top-0 left-0 m-2 p-2 bg-primary text-primary-foreground rounded z-50"
        >
          {t.skipToContent}
        </a>
        <AuthProvider>
          <ArchiveProvider>
            <AppProviders>
              {children}
              <ChatWidget t={t} />
              <Toaster />
            </AppProviders>
          </ArchiveProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
