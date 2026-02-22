import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/lib/pwa/security-headers";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "exceljs",
    "mammoth",
    "adm-zip",
    "nodemailer",
    "jspdf",
    "sanitize-html",
    "sharp",
    "@prisma/client",
    "prisma",
  ],
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
