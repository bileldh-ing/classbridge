import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/teachers", "/subjects", "/courses"], disallow: ["/api/", "/dashboard", "/lessons", "/teach", "/admin", "/messages", "/settings", "/notifications", "/payments", "/saved", "/my-courses", "/dev/"] }],
    sitemap: `${env().APP_URL}/sitemap.xml`,
  };
}
