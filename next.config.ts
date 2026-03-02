import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "exceljs",
    "mammoth",
    "adm-zip",
    "nodemailer",
    "web-push",
    "jspdf",
    "archiver",
    "stripe",
    "sanitize-html",
    "sharp",
    "@prisma/client",
    "prisma",
    "@sentry/nextjs",
  ],
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon.png",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
