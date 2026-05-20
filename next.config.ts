import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

const nextConfig: NextConfig = {
  transpilePackages: [],
  serverExternalPackages: [
    "exceljs",
    "mammoth",
    "adm-zip",
    "nodemailer",
    "web-push",
    "jspdf",
    "archiver",
    "sanitize-html",
    "sharp",
    "@prisma/client",
    "prisma",
    "@sentry/nextjs",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getSecurityHeaders(),
      },
      {
        // Presales external route group. Per locked decision: never cache
        // the guest-rendered HTML (signed PDF + IP-bearing fields cannot
        // sit in a proxy), and strip the Referer so client URLs do not
        // leak the grant token to upstream analytics or CDN logs.
        source: "/c/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
