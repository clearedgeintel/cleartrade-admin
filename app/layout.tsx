import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ClearTrade — Automated Trading Bots, Fully Managed',
  description:
    'Deploy your own isolated, AI-powered Alpaca trading bot in minutes. Your keys, your portfolio, your subdomain.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#22d3ee',
          colorBackground: '#0a0e17',
          colorInputBackground: '#11151f',
          colorText: '#f1f5f9',
          colorTextSecondary: '#8a93a5',
          borderRadius: '0.625rem',
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
        <body className="min-h-screen bg-background font-sans text-foreground antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
