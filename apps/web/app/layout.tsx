import type { Metadata, Viewport } from "next";
import { Caveat, Geist_Mono, Manrope, Sanchez } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";

import { Providers } from "@/components/providers/providers";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/consent";
import { LOCALE_COOKIE, readLocaleCookie } from "@/lib/i18n/locales";
import { SITE_URL } from "@/lib/site";
import { readThemeCookie, THEME_COOKIE, themeInitScript } from "@/lib/theme";
import "./globals.css";

/** UI body font fallback until Codec Pro files are added under public/fonts/codec-pro/. */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sanchez = Sanchez({
  variable: "--font-sanchez",
  subsets: ["latin"],
  weight: ["400"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Stack32 — Build your next AI agent",
    template: "%s · Stack32",
  },
  description:
    "Describe the agent you need. Stack32 builds the agent, tests it and makes it ready to use.",
  applicationName: "Stack32",
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#080808" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const hasLocaleCookie = Boolean(localeCookie);
  const initialLocale = readLocaleCookie(localeCookie);
  const initialTheme = readThemeCookie(cookieStore.get(THEME_COOKIE)?.value);
  const initialConsent = parseConsentCookie(cookieStore.get(CONSENT_COOKIE)?.value);

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      className={`${manrope.variable} ${sanchez.variable} ${geistMono.variable} ${caveat.variable} ${initialTheme === "dark" ? "dark" : ""} h-full antialiased`}
    >
      <head>
        <Script id="stack32-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="bg-background text-foreground min-h-full overflow-x-hidden font-sans">
        <Providers
          initialLocale={initialLocale}
          hasLocaleCookie={hasLocaleCookie}
          initialTheme={initialTheme}
          initialConsent={initialConsent}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
