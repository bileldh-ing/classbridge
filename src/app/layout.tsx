import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { env } from "@/lib/env";
import { ServiceWorkerRegister } from "@/components/client/sw-register";

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: { default: "ClassBridge — find a teacher, learn live", template: "%s · ClassBridge" },
  description: "Find verified teachers for online and in-person lessons. Book real availability, pay securely and join a private live classroom.",
  openGraph: { type: "website", siteName: "ClassBridge" },
  applicationName: "ClassBridge",
  appleWebApp: { capable: true, title: "ClassBridge", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b7f75" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-white antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">{t.nav.skipToContent}</a>
        <I18nProvider locale={locale} t={t}>{children}</I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
