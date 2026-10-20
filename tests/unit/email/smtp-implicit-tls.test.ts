// @vitest-environment node
/**
 * SMTP: implicit TLS on 465, STARTTLS required everywhere else (roadmap P0.13,
 * lib/email/smtp-options.ts).
 *
 * Both transports used to hard-code `secure: false`, so pointed at 465 they
 * opened a plain-text conversation with a server waiting for a TLS handshake
 * and every sign-in link timed out. The acceptance is the transport each one
 * actually builds, read off nodemailer, for both the app's mail and the
 * presales guest mail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("nodemailer", () => {
  const createTransport = (options: Record<string, unknown>) => {
    created.push(options);
    return { sendMail: async () => ({ messageId: "test-id" }) };
  };
  return { default: { createTransport }, createTransport };
});

import { sendEmail } from "@/lib/email/brevo";
import { smtpConnectionOptions } from "@/lib/email/smtp-options";
import { dispatchEmail } from "@/lib/presales/emails";

beforeEach(() => {
  created.length = 0;
  vi.stubEnv("SMTP_USER", "mailer");
  vi.stubEnv("SMTP_PASS", "secret");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the connection settings", () => {
  it("port 465 is implicit TLS", () => {
    const options = smtpConnectionOptions({ SMTP_PORT: "465" });
    expect(options.secure).toBe(true);
    expect(options.port).toBe(465);
  });

  it("587 starts in plain text and must upgrade with STARTTLS", () => {
    expect(smtpConnectionOptions({ SMTP_PORT: "587" })).toMatchObject({ secure: false, requireTLS: true });
  });

  it("the default is Brevo on 587 with STARTTLS, as before", () => {
    expect(smtpConnectionOptions({})).toMatchObject({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      requireTLS: true,
    });
  });

  it("SMTP_SECURE=true asks for implicit TLS on another port", () => {
    expect(smtpConnectionOptions({ SMTP_PORT: "2465", SMTP_SECURE: "true" })).toMatchObject({ secure: true });
  });

  it("SMTP_REQUIRE_TLS=false allows a plain local relay, and nothing else does", () => {
    expect(smtpConnectionOptions({ SMTP_PORT: "1025", SMTP_REQUIRE_TLS: "false" })).toMatchObject({
      secure: false,
      requireTLS: false,
    });
    expect(smtpConnectionOptions({ SMTP_PORT: "1025", SMTP_REQUIRE_TLS: "no" }).requireTLS).toBe(true);
  });

  it("a nonsense port falls back to 587 rather than NaN", () => {
    expect(smtpConnectionOptions({ SMTP_PORT: "smtp" }).port).toBe(587);
  });
});

describe("the transports actually built", () => {
  it("the app's mail on 465 connects with implicit TLS", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    await sendEmail({ to: { email: "a@example.com" }, subject: "s", htmlContent: "<p>h</p>" });
    expect(created.at(-1)).toMatchObject({ host: "smtp.example.com", port: 465, secure: true });
  });

  it("the presales guest mail on 465 connects with implicit TLS", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    await dispatchEmail({ to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(created.at(-1)).toMatchObject({ port: 465, secure: true });
  });

  it("both, on 587, require STARTTLS", async () => {
    vi.stubEnv("SMTP_PORT", "587");
    await sendEmail({ to: { email: "a@example.com" }, subject: "s", htmlContent: "<p>h</p>" });
    await dispatchEmail({ to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(created).toHaveLength(2);
    for (const options of created) expect(options).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });
});
