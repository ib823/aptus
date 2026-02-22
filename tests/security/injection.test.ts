/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/app/api/ routes
 * WIRING BLOCKED BY: Simulate middleware
 *
 * Security Tests — Injection Prevention (T-SEC-030 through T-SEC-035)
 *
 * Validates that the application is protected against common injection attacks:
 * SQL injection, XSS, SSRF, path traversal, and CSV injection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── SQL Injection Prevention ─────────────────────────────────────────────

/**
 * Simulates parameterized query construction.
 * Real implementation uses Prisma which prevents SQL injection by default.
 */
function buildParameterizedQuery(
  table: string,
  filters: Record<string, string>,
): { query: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(filters)) {
    // Only allow alphanumeric column names
    if (!/^[a-zA-Z_]+$/.test(key)) {
      throw new Error(`Invalid column name: ${key}`);
    }
    conditions.push(`"${key}" = $${paramIndex}`);
    params.push(value); // Value is always parameterized, never interpolated
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  return {
    query: `SELECT * FROM "${table}"${whereClause}`,
    params,
  };
}

// ── XSS Sanitization ────────────────────────────────────────────────────

/** Sanitize HTML content to prevent XSS (mirrors @/lib/security/sanitize) */
function sanitizeOutput(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/** Strip dangerous HTML tags while preserving safe content */
function stripDangerousTags(html: string): string {
  // Remove script tags and content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  // Remove event handlers
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""');
  return clean;
}

// ── SSRF Prevention ─────────────────────────────────────────────────────

/** Validate that a URL is safe for server-side requests */
function validateExternalUrl(url: string): { safe: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Block internal/private networks
    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254", // AWS metadata
      "metadata.google.internal", // GCP metadata
      "[::1]",
    ];

    if (blockedHosts.includes(parsed.hostname)) {
      return { safe: false, error: "BLOCKED_INTERNAL_HOST" };
    }

    // Block private IP ranges
    const ipMatch = parsed.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return { safe: false, error: "BLOCKED_PRIVATE_IP" };
      if (a === 172 && b! >= 16 && b! <= 31) return { safe: false, error: "BLOCKED_PRIVATE_IP" };
      if (a === 192 && b === 168) return { safe: false, error: "BLOCKED_PRIVATE_IP" };
    }

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      return { safe: false, error: "HTTPS_REQUIRED" };
    }

    return { safe: true };
  } catch {
    return { safe: false, error: "INVALID_URL" };
  }
}

// ── Path Traversal Prevention ───────────────────────────────────────────

/** Validate file upload path to prevent directory traversal */
function validateUploadPath(filename: string): { safe: boolean; sanitized: string; error?: string } {
  // Strip path traversal sequences
  const sanitized = filename
    .replace(/\.\./g, "")
    .replace(/\//g, "")
    .replace(/\\/g, "")
    .replace(/\0/g, "");

  if (sanitized !== filename) {
    return { safe: false, sanitized, error: "PATH_TRAVERSAL_DETECTED" };
  }

  // Check for hidden files
  if (sanitized.startsWith(".")) {
    return { safe: false, sanitized, error: "HIDDEN_FILE_REJECTED" };
  }

  // Only allow safe extensions
  const allowedExtensions = [".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"];
  const ext = sanitized.substring(sanitized.lastIndexOf(".")).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { safe: false, sanitized, error: "DISALLOWED_EXTENSION" };
  }

  return { safe: true, sanitized };
}

// ── CSV Injection Prevention ────────────────────────────────────────────

/** Escape cell content to prevent CSV injection (formula injection) */
function escapeCsvCell(value: string): string {
  const dangerousChars = ["=", "+", "-", "@", "\t", "\r", "\n"];
  if (dangerousChars.some((char) => value.startsWith(char))) {
    return `'${value}`;
  }
  // Escape double quotes
  if (value.includes('"') || value.includes(",")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Injection Prevention", () => {
  describe("T-SEC-030: SQL injection in search/filter — parameterized queries prevent", () => {
    it("parameterizes values instead of interpolating them", () => {
      const malicious = "'; DROP TABLE users; --";
      const { query, params } = buildParameterizedQuery("assessments", {
        companyName: malicious,
      });

      expect(query).toBe('SELECT * FROM "assessments" WHERE "companyName" = $1');
      expect(params[0]).toBe(malicious);
      expect(query).not.toContain("DROP TABLE");
    });

    it("handles UNION-based SQL injection attempts", () => {
      const unionAttack = "' UNION SELECT * FROM users --";
      const { query, params } = buildParameterizedQuery("assessments", {
        status: unionAttack,
      });

      expect(query).not.toContain("UNION");
      expect(params[0]).toBe(unionAttack);
    });

    it("rejects column names with SQL injection characters", () => {
      expect(() =>
        buildParameterizedQuery("assessments", {
          "name; DROP TABLE users": "value",
        }),
      ).toThrow("Invalid column name");
    });

    it("handles boolean-based blind injection", () => {
      const blindAttack = "' OR '1'='1";
      const { params } = buildParameterizedQuery("assessments", {
        id: blindAttack,
      });

      expect(params[0]).toBe(blindAttack);
    });

    it("handles multiple filters safely", () => {
      const { query, params } = buildParameterizedQuery("assessments", {
        status: "draft",
        companyName: "Acme",
        country: "US",
      });

      expect(query).toContain("$1");
      expect(query).toContain("$2");
      expect(query).toContain("$3");
      expect(params).toHaveLength(3);
    });

    it("handles stacked queries injection attempt", () => {
      const stacked = "value'; INSERT INTO users (role) VALUES ('admin'); --";
      const { query, params } = buildParameterizedQuery("assessments", {
        name: stacked,
      });

      expect(query).not.toContain("INSERT");
      expect(params[0]).toBe(stacked);
    });
  });

  describe("T-SEC-031: XSS in comment body — sanitized on output", () => {
    it("escapes script tags in comment body", () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = sanitizeOutput(malicious);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("&lt;script&gt;");
    });

    it("escapes inline event handlers", () => {
      const malicious = '<img src="x" onerror="alert(1)">';
      const stripped = stripDangerousTags(malicious);
      expect(stripped).not.toContain("onerror");
    });

    it("escapes HTML entities in comment text", () => {
      const malicious = '<div onmouseover="steal()">hover me</div>';
      const sanitized = sanitizeOutput(malicious);
      expect(sanitized).not.toContain("<div");
      expect(sanitized).toContain("&lt;div");
    });

    it("handles nested script injection", () => {
      const malicious = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const sanitized = sanitizeOutput(malicious);
      expect(sanitized).not.toContain("<script>");
    });

    it("escapes javascript: protocol in links", () => {
      const malicious = '<a href="javascript:alert(1)">click</a>';
      const stripped = stripDangerousTags(malicious);
      expect(stripped).not.toContain("javascript:");
    });
  });

  describe("T-SEC-032: XSS in assessment name — sanitized on output", () => {
    it("escapes HTML in assessment names", () => {
      const maliciousName = '<img src=x onerror=alert(document.cookie)>';
      const sanitized = sanitizeOutput(maliciousName);
      expect(sanitized).not.toContain("<img");
      expect(sanitized).toContain("&lt;img");
    });

    it("escapes quotes in assessment names", () => {
      const maliciousName = '" onload="alert(1)';
      const sanitized = sanitizeOutput(maliciousName);
      expect(sanitized).not.toContain('" onload');
      expect(sanitized).toContain("&quot;");
    });

    it("escapes SVG-based XSS", () => {
      const maliciousName = '<svg/onload=alert(1)>';
      const sanitized = sanitizeOutput(maliciousName);
      expect(sanitized).not.toContain("<svg");
    });

    it("preserves safe content while escaping dangerous content", () => {
      const mixed = "Acme Corp <script>alert(1)</script> Assessment";
      const sanitized = sanitizeOutput(mixed);
      expect(sanitized).toContain("Acme Corp");
      expect(sanitized).toContain("Assessment");
      expect(sanitized).not.toContain("<script>");
    });
  });

  describe("T-SEC-033: SSRF via integration point URL — URL validation prevents", () => {
    it("blocks requests to localhost", () => {
      const result = validateExternalUrl("https://localhost/admin");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_INTERNAL_HOST");
    });

    it("blocks requests to 127.0.0.1", () => {
      const result = validateExternalUrl("https://127.0.0.1/api");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_INTERNAL_HOST");
    });

    it("blocks requests to AWS metadata endpoint", () => {
      const result = validateExternalUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.safe).toBe(false);
    });

    it("blocks requests to GCP metadata endpoint", () => {
      const result = validateExternalUrl("https://metadata.google.internal/computeMetadata/v1/");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_INTERNAL_HOST");
    });

    it("blocks private 10.x.x.x addresses", () => {
      const result = validateExternalUrl("https://10.0.0.1/internal-api");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_PRIVATE_IP");
    });

    it("blocks private 172.16-31.x.x addresses", () => {
      const result = validateExternalUrl("https://172.16.0.1/internal");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_PRIVATE_IP");
    });

    it("blocks private 192.168.x.x addresses", () => {
      const result = validateExternalUrl("https://192.168.1.1/router");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_PRIVATE_IP");
    });

    it("requires HTTPS protocol", () => {
      const result = validateExternalUrl("http://api.example.com/data");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("HTTPS_REQUIRED");
    });

    it("allows legitimate external HTTPS URLs", () => {
      const result = validateExternalUrl("https://api.sap.com/odata/v4");
      expect(result.safe).toBe(true);
    });

    it("rejects invalid URLs", () => {
      const result = validateExternalUrl("not-a-url");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("INVALID_URL");
    });

    it("blocks IPv6 loopback", () => {
      const result = validateExternalUrl("https://[::1]/admin");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("BLOCKED_INTERNAL_HOST");
    });
  });

  describe("T-SEC-034: Path traversal in file upload — prevented", () => {
    it("rejects filenames with ../ sequences", () => {
      const result = validateUploadPath("../../etc/passwd");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL_DETECTED");
    });

    it("rejects filenames with backslash traversal", () => {
      const result = validateUploadPath("..\\..\\windows\\system32\\config");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL_DETECTED");
    });

    it("rejects filenames with null bytes", () => {
      const result = validateUploadPath("file.pdf\0.exe");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("PATH_TRAVERSAL_DETECTED");
    });

    it("rejects hidden files (dotfiles)", () => {
      const result = validateUploadPath(".htaccess");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("HIDDEN_FILE_REJECTED");
    });

    it("rejects disallowed file extensions", () => {
      const result = validateUploadPath("malware.exe");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("DISALLOWED_EXTENSION");
    });

    it("rejects .html extensions (XSS vector)", () => {
      const result = validateUploadPath("page.html");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("DISALLOWED_EXTENSION");
    });

    it("rejects .js extensions", () => {
      const result = validateUploadPath("script.js");
      expect(result.safe).toBe(false);
      expect(result.error).toBe("DISALLOWED_EXTENSION");
    });

    it("allows safe PDF uploads", () => {
      const result = validateUploadPath("report.pdf");
      expect(result.safe).toBe(true);
      expect(result.sanitized).toBe("report.pdf");
    });

    it("allows safe XLSX uploads", () => {
      const result = validateUploadPath("data-export.xlsx");
      expect(result.safe).toBe(true);
    });

    it("allows safe image uploads", () => {
      expect(validateUploadPath("photo.png").safe).toBe(true);
      expect(validateUploadPath("photo.jpg").safe).toBe(true);
      expect(validateUploadPath("photo.jpeg").safe).toBe(true);
    });

    it("strips path components from traversal attempts", () => {
      const result = validateUploadPath("../../../secret.pdf");
      expect(result.sanitized).not.toContain("..");
      expect(result.sanitized).not.toContain("/");
    });
  });

  describe("T-SEC-035: CSV injection in export — cells escaped", () => {
    it("escapes cells starting with = (formula)", () => {
      const malicious = "=HYPERLINK(\"http://evil.com\",\"Click\")";
      const escaped = escapeCsvCell(malicious);
      expect(escaped).toBe(`'${malicious}`);
      expect(escaped.startsWith("=")).toBe(false);
    });

    it("escapes cells starting with + (formula)", () => {
      const malicious = "+cmd|'/C calc'!A0";
      const escaped = escapeCsvCell(malicious);
      expect(escaped).toBe(`'${malicious}`);
      expect(escaped.startsWith("+")).toBe(false);
    });

    it("escapes cells starting with - (formula)", () => {
      const malicious = "-1+1+cmd|'/C calc'!A0";
      const escaped = escapeCsvCell(malicious);
      expect(escaped).toBe(`'${malicious}`);
    });

    it("escapes cells starting with @ (formula)", () => {
      const malicious = "@SUM(A1:A10)";
      const escaped = escapeCsvCell(malicious);
      expect(escaped).toBe(`'${malicious}`);
    });

    it("escapes cells starting with tab character", () => {
      const malicious = "\t=cmd|'/C calc'!A0";
      const escaped = escapeCsvCell(malicious);
      expect(escaped.startsWith("'")).toBe(true);
    });

    it("does not modify safe cell content", () => {
      const safe = "Acme Corporation";
      const escaped = escapeCsvCell(safe);
      expect(escaped).toBe(safe);
    });

    it("handles cells with commas (wraps in quotes)", () => {
      const withComma = "New York, NY";
      const escaped = escapeCsvCell(withComma);
      expect(escaped).toBe('"New York, NY"');
    });

    it("handles cells with existing double quotes (escapes them)", () => {
      const withQuotes = 'He said "hello"';
      const escaped = escapeCsvCell(withQuotes);
      expect(escaped).toBe('"He said ""hello"""');
    });

    it("escapes DDE injection attempts", () => {
      const dde = "=DDE(\"cmd\",\"/C calc\",\"!A0\")";
      const escaped = escapeCsvCell(dde);
      expect(escaped.startsWith("'")).toBe(true);
      expect(escaped).not.toMatch(/^=/);
    });
  });
});
