import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Roboto_Condensed } from "next/font/google";
import "./globals.css";
import "@/lib/suppress-console"; // Suppress console logs in production
import { AuthProvider } from "@/lib/auth/AuthContext";
import QueryProvider from "@/lib/providers/QueryProvider";

// Note: BBH Sans fonts are not available on Google Fonts, using Roboto as fallback
// Noto Sans JP will also use Roboto Condensed as it's not available via Next.js font optimization

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Sona Cohort",
  description: "Sona Cohort - Peer Tutor Management System",
  icons: {
    icon: "/peers.ico",
    shortcut: "/peers.ico",
    apple: "/peers.png",
  },
};

import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('sidebar-collapsed');
                  if (saved === 'true') {
                    document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,100..900;1,100..900&display=swap');

            .roboto-condensed-title {
              font-family: "Roboto Condensed", sans-serif;
              font-optical-sizing: auto;
              font-weight: 700;
              font-style: normal;
            }

            .roboto-condensed-subtitle {
              font-family: "Roboto Condensed", sans-serif;
              font-optical-sizing: auto;
              font-weight: 400;
              font-style: normal;
            }

            .bbh-sans-bogle-regular {
              font-family: "Roboto Condensed", sans-serif;
              font-weight: 400;
              font-style: normal;
            }

            .bbh-sans-hegarty-regular {
              font-family: "Roboto Condensed", sans-serif;
              font-weight: 400;
              font-style: normal;
            }

            .noto-sans-jp-regular {
              font-family: "Roboto Condensed", sans-serif;
              font-optical-sizing: auto;
              font-weight: 400;
              font-style: normal;
            }

            .noto-sans-jp-bold {
              font-family: "Roboto Condensed", sans-serif;
              font-optical-sizing: auto;
              font-weight: 700;
              font-style: normal;
            }
          `
        }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${robotoCondensed.variable} antialiased`}
      >
        <QueryProvider>
          <AuthProvider>
            <Toaster position="top-right" expand={false} richColors />
            {children}
          </AuthProvider>
        </QueryProvider>
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-0CRJ93QBZ4"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-0CRJ93QBZ4');
            `,
          }}
        />
      </body>
    </html>
  );
}
