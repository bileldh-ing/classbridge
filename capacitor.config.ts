import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native wrapper (Android / iOS) around the DEPLOYED web app. The shell loads CAP_SERVER_URL (your production URL)
 * so server-rendered pages, auth cookies and security headers work exactly as on the web; `mobile/www` is only a
 * bundled fallback screen. Set CAP_SERVER_URL before `pnpm cap:sync` (CI does this from a repository variable).
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://classbridge.example.com";

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? "com.classbridge.app",
  appName: "ClassBridge",
  webDir: "mobile/www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [new URL(serverUrl).host],
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic", limitsNavigationsToAppBoundDomains: false },
};

export default config;
