import type { MetadataRoute } from "next";

/** Web app manifest: installable PWA (Chrome/Edge/Android "Install app", iOS "Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ClassBridge — find a teacher, learn live",
    short_name: "ClassBridge",
    description: "Find verified teachers, book real availability and join private live lessons and self-paced courses.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b7f75",
    lang: "en",
    dir: "auto",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a teacher", url: "/teachers", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My lessons", url: "/lessons", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
