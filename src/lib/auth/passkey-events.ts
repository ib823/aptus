/**
 * The durable trail of passkeys added to and removed from an account.
 *
 * WHY IT EXISTS. The governance step-up (lib/auth/step-up.ts) accepts any
 * passkey registered to the person, so the set of passkeys is itself what the
 * step-up protects. Adding one beside an existing passkey, or removing one,
 * needs a fresh assertion from a passkey the person already has. A FIRST
 * passkey cannot — there is nothing to assert with — so whoever holds the
 * session can add it: trust on first use. That cannot be closed, only made
 * visible, and this is where it is made visible:
 *
 *   - an audit row (`Passkey` / CREATE or REVOKE) per change — ConfigAudit, or
 *     PlatformAudit for an account with no organization — append-only
 *     like every governance record, so "which passkeys did this account gain,
 *     from where, and was it stepped up" has an answer after the fact;
 *   - an email to the person for every passkey added, so an enrolment they did
 *     not make reaches them while it still matters.
 *
 * Both are best-effort, like every ConfigAudit write and the sign-in
 * notification: a failed record or email must not fail the person's own
 * enrolment, and each failure is logged loudly.
 */

import { parseDevice } from "@/lib/auth/login-notify";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/brevo";
import { passkeyAddedEmail } from "@/lib/email/templates";
import { writeConfigAudit, writePlatformAudit } from "@/lib/studio/audit";
import type { SessionUser } from "@/types/assessment";

interface PasskeyEventSource {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Write one Passkey row under the person's tenant. A person with no
 * organization — a platform admin, or an account an admin created without
 * one — has no tenant to file it under (ConfigAudit rows belong to one), so it
 * goes to the platform-level trail. Those are the most privileged accounts
 * there are; their first-passkey enrolment is exactly what must stay visible.
 */
async function recordPasskeyAudit(
  user: Pick<SessionUser, "id" | "organizationId">,
  credentialId: string,
  action: "CREATE" | "REVOKE",
  after: Record<string, unknown>,
): Promise<void> {
  const entry = { actorId: user.id, entityType: "Passkey" as const, entityId: credentialId, action, after };
  if (!user.organizationId) {
    await writePlatformAudit(entry);
    return;
  }
  await writeConfigAudit({ organizationId: user.organizationId, ...entry });
}

/**
 * A passkey was registered on this account: record it, then tell the person.
 *
 * `firstPasskey` says whether this was the trust-on-first-use enrolment, the
 * one the step-up could not guard; `stepUp` is the gate's outcome for the
 * enrolment of any later one.
 */
export async function recordPasskeyAdded(
  user: Pick<SessionUser, "id" | "organizationId" | "email" | "name">,
  passkey: { readonly credentialId: string; readonly deviceName: string | null },
  detail: { readonly firstPasskey: boolean; readonly stepUp: string } & PasskeyEventSource,
): Promise<void> {
  await recordPasskeyAudit(user, passkey.credentialId, "CREATE", {
    event: "passkey_added",
    credentialId: passkey.credentialId,
    deviceName: passkey.deviceName,
    firstPasskey: detail.firstPasskey,
    stepUp: detail.stepUp,
    ipAddress: detail.ipAddress,
  });

  // Fire-and-forget, like the sign-in notification: the person's enrolment
  // does not wait on a mail server.
  void notifyPasskeyAdded(user, passkey, detail).catch((err: unknown) => {
    console.error("[passkey] failed to send passkey-added email", { userId: user.id, err });
  });
}

async function notifyPasskeyAdded(
  user: Pick<SessionUser, "id" | "email" | "name">,
  passkey: { readonly deviceName: string | null },
  source: PasskeyEventSource,
): Promise<void> {
  // The session's copy of the name and address can be stale; the row is not.
  const recipient = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, name: true },
  });
  if (!recipient) return;

  // The portal's security page, as the sign-in notification links it: it is
  // where a passkey can be removed (lib/auth/login-notify.ts).
  const reviewUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/settings/security`;
  const email = passkeyAddedEmail({
    recipientName: recipient.name,
    email: recipient.email,
    passkeyName: passkey.deviceName ?? "Unnamed passkey",
    ipAddress: source.ipAddress ?? "Unknown",
    device: source.userAgent ? parseDevice(source.userAgent) : "Unknown device",
    time: new Date().toUTCString(),
    reviewUrl,
  });

  await sendEmail({
    to: { email: recipient.email, name: recipient.name },
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: ["passkey-added"],
  });
}

/** A passkey was removed from this account. */
export async function recordPasskeyRemoved(
  user: Pick<SessionUser, "id" | "organizationId">,
  credentialId: string,
  detail: { readonly remaining: number; readonly stepUp: string } & PasskeyEventSource,
): Promise<void> {
  await recordPasskeyAudit(user, credentialId, "REVOKE", {
    event: "passkey_removed",
    credentialId,
    remaining: detail.remaining,
    stepUp: detail.stepUp,
    ipAddress: detail.ipAddress,
  });
}
