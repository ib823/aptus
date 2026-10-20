/**
 * The SMTP connection settings, for every nodemailer transport in the app.
 *
 * THE DEFECT (roadmap P0.13). Both transports — this app's transactional mail
 * and the presales guest mail — hard-coded `secure: false` with the comment
 * "STARTTLS on 587". Pointed at port 465, which speaks TLS from the first byte
 * (implicit TLS, RFC 8314), nodemailer then opened a plain-text conversation
 * with a server waiting for a TLS handshake, and every send hung until it
 * timed out. A self-hosted instance whose relay offers only 465 could send no
 * sign-in link at all, so nobody could sign in.
 *
 * THE RULE: port 465 is implicit TLS. Any other port starts in plain text and
 * MUST upgrade with STARTTLS before credentials are sent (`requireTLS`):
 * nodemailer only upgrades opportunistically by default, so a relay (or a
 * downgrade in between) that did not offer STARTTLS used to receive the SMTP
 * password in the clear. Brevo's 587 offers STARTTLS, so production behaves as
 * before.
 *
 *   SMTP_SECURE=true       implicit TLS on a port other than 465.
 *   SMTP_REQUIRE_TLS=false allow a plain-text relay (a local test catcher such
 *                          as MailHog on 1025). Never on a real deployment.
 */

/** process.env, or any plain map of the same variables (tests pass one). */
type EnvVars = Readonly<Record<string, string | undefined>>;

export interface SmtpConnectionOptions {
  host: string;
  port: number;
  /** Implicit TLS: the connection is TLS from the first byte. */
  secure: boolean;
  /** Refuse to continue unless STARTTLS upgrades a plain connection. */
  requireTLS: boolean;
  auth: { user: string; pass: string };
}

export function smtpConnectionOptions(env: EnvVars = process.env): SmtpConnectionOptions {
  const parsedPort = Number(env.SMTP_PORT ?? 587);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secure = port === 465 || env.SMTP_SECURE?.trim().toLowerCase() === "true";
  const allowPlain = env.SMTP_REQUIRE_TLS?.trim().toLowerCase() === "false";
  return {
    host: env.SMTP_HOST ?? "smtp-relay.brevo.com",
    port,
    secure,
    // Meaningless once the connection is already TLS; required otherwise.
    requireTLS: !secure && !allowPlain,
    auth: {
      user: env.SMTP_USER ?? "",
      pass: env.SMTP_PASS ?? "",
    },
  };
}
