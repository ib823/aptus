/** NextAuth configuration — magic link authentication via Brevo */

import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/brevo";
import { magicLinkEmail, workbenchSigninEmail } from "@/lib/email/templates";
import type { Adapter } from "next-auth/adapters";
import { canRegister } from "@/lib/auth/auth-config";
import { buildConfirmUrl } from "@/lib/auth/magic-link-confirm";

/**
 * Custom adapter that wraps Prisma for NextAuth compatibility.
 * Overrides createUser because our User model requires `role` (no default)
 * and `name` (non-nullable) which PrismaAdapter doesn't provide.
 */
function getAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);
  return {
    ...baseAdapter,
    createUser: async (data: { email: string; emailVerified?: Date | null; name?: string | null; image?: string | null }) => {
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? "platform_admin" : "consultant";
      return prisma.user.create({
        data: {
          email: data.email,
          emailVerified: data.emailVerified ?? null,
          name: data.name || data.email.split("@")[0] || "User",
          image: data.image ?? null,
          role,
        },
      });
    },
    /**
     * Session methods are intentionally no-ops because we use a custom session
     * system (src/lib/auth/session.ts) instead of NextAuth's built-in sessions.
     * NextAuth is used only for the magic-link email flow and user creation.
     * Our custom sessions provide: concurrent session limits, MFA tracking,
     * session rotation, IP tracking, and revocation.
     */
    createSession: () => Promise.resolve(null!),
    getSessionAndUser: () => Promise.resolve(null),
    updateSession: () => Promise.resolve(null),
    deleteSession: () => Promise.resolve(null),
  } as Adapter;
}

export const authOptions: NextAuthOptions = {
  adapter: getAdapter(),
  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER ?? {
        host: "localhost",
        port: 1025,
        auth: { user: "", pass: "" },
      },
      from: process.env.EMAIL_FROM ?? "no-reply@brevo.com",
      sendVerificationRequest: async ({ identifier: email, url }) => {
        if (!process.env.SMTP_USER) {
          if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
            console.warn(`\n[MAGIC LINK] For ${email}:\n${url}\n`);
          } else {
            console.error(`[AUTH] SMTP_USER not configured — cannot send magic link to ${email}`);
          }
          return;
        }

        try {
          // Detect Workbench context from the callbackUrl embedded in the
          // verification URL. NextAuth packs the original callbackUrl as
          // a query param on /api/auth/callback/email?token=...&callbackUrl=...
          // When the destination is /presales/* we send the Workbench-branded
          // template AND wrap the URL in a confirm-page interstitial so that
          // Outlook Safe Links / Brevo click-trackers can prefetch the
          // interstitial (harmless) instead of the raw callback (which would
          // burn the single-use token before the user clicks).
          let isWorkbench = false;
          let emailUrl = url;
          try {
            const parsed = new URL(url);
            const callback = parsed.searchParams.get("callbackUrl") ?? "";
            isWorkbench =
              callback.startsWith("/presales") ||
              callback.startsWith("/affirm") ||
              callback.startsWith("/c/") ||
              callback.includes("/presales") ||
              callback.includes("/affirm");
            if (isWorkbench) {
              // When the Workbench is on its own hostname (e.g.
              // ab-workbench.vercel.app), rewrite the verification URL so
              // the entire auth flow happens on that hostname — the
              // /api/auth/callback/email callback lands there, sets its
              // cookie there, and redirects to /presales there. Without
              // the rewrite, the cookie would be set on PORTAL_HOST and
              // the user would land logged-out on WORKBENCH_HOST (since
              // *.vercel.app is on the Public Suffix List, cookies cannot
              // span subdomains).
              const workbenchHost = process.env.WORKBENCH_HOST;
              if (workbenchHost) {
                parsed.host = workbenchHost;
                parsed.protocol = "https:";
              }
              // Seal the callback URL inside the confirm interstitial so a
              // GET scanner (Outlook Safe Links etc.) can never reach — and
              // burn — the single-use token before the human clicks.
              emailUrl = buildConfirmUrl(parsed.toString(), parsed.origin);
            }
          } catch {
            /* unparseable url falls through to Aptus template */
          }
          const template = isWorkbench
            ? workbenchSigninEmail(emailUrl, email)
            : magicLinkEmail(emailUrl, email);
          await sendEmail({
            to: { email },
            subject: template.subject,
            htmlContent: template.html,
            textContent: template.text,
            tags: [isWorkbench ? "workbench-signin" : "magic-link", "auth"],
          });
        } catch (err) {
          console.error("[AUTH] Failed to send magic link email:", err);
          throw new Error("Failed to send verification email");
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=true",
    error: "/login?error=true",
  },
  callbacks: {
    /**
     * Redirect callback — controls where NextAuth sends the browser after
     * a successful sign-in (or sign-out). The default behavior turns any
     * relative path like "/presales" into "<NEXTAUTH_URL>/presales", which
     * in our two-host setup means a /presales redirect after a Workbench
     * sign-in lands the user on aptus-sandy.vercel.app/presales (NEXTAUTH_URL
     * host) instead of staying on ab-workbench.vercel.app. The browser then
     * follows our middleware's 308 back to ab-workbench but the just-issued
     * session-token cookie is scoped to ab-workbench, so it isn't sent to
     * aptus-sandy and the bounce loses the session. Result: signed-in user
     * lands at /presales/login on ab-workbench — looks like a sign-in loop.
     *
     * Override: for relative URLs, return them verbatim so the browser
     * resolves against the request URL (which is whichever host the user
     * actually authed on). For absolute URLs that target WORKBENCH_HOST,
     * allow them through too. Otherwise fall back to NextAuth's default
     * "same baseUrl host only" rule.
     */
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) return url;
      const workbenchHost = process.env.WORKBENCH_HOST;
      if (workbenchHost) {
        try {
          const u = new URL(url);
          if (u.host === workbenchHost) return url;
        } catch {
          /* fall through */
        }
      }
      try {
        const u = new URL(url);
        const b = new URL(baseUrl);
        if (u.host === b.host) return url;
      } catch {
        /* fall through */
      }
      return baseUrl;
    },
    async signIn({ user }) {
      if (!user.email) return false;

      const email = user.email.toLowerCase();

      // 1. Check if user already exists in the system
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      // 2. If user exists, only check if they are active
      if (existingUser) {
        // Surface the exact reason a magic-link click is rejected. Without
        // this, an inactive account returns false here, NextAuth emits
        // `error=AccessDenied`, and the user is bounced back to the sign-in
        // page — indistinguishable in logs from a token failure. Names only.
        if (!existingUser.isActive) {
          console.warn(`[AUTH/signIn] denied: account inactive — ${email}`);
        }
        return existingUser.isActive;
      }

      // 3. If user is NEW, enforce the security policy
      const policy = canRegister(email);
      if (!policy.allowed) {
        console.warn(
          `[AUTH/signIn] denied: registration policy — ${email}: ${policy.reason}`,
        );
      }
      return policy.allowed;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: {
            id: true,
            role: true,
          },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const { email: _email, image: _image, ...safeUser } = session.user;
        session.user = {
          ...safeUser,
          ...(token.userId ? { id: token.userId, role: token.role } : {}),
        };
      }
      return session;
    },
  },
};
