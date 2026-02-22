/** NextAuth configuration — magic link authentication via Brevo */

import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
// createSession and SESSION_COOKIE_NAME are used by the bridge route (src/app/api/auth/bridge/route.ts),
// not here. This file only exports authOptions for NextAuth.
import { sendEmail } from "@/lib/email/brevo";
import { magicLinkEmail } from "@/lib/email/templates";
import type { Adapter } from "next-auth/adapters";

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
    // Override session methods to no-ops: we use JWT strategy with a custom
    // Session model (token/expiresAt) that doesn't match PrismaAdapter's
    // expected schema (sessionToken/expires). Without these overrides, the
    // adapter may attempt CRUD on Session with wrong field names.
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
        // Without SMTP credentials, log to console
        if (!process.env.SMTP_USER) {
          console.log(`\n[MAGIC LINK] For ${email}:\n${url}\n`);
          return;
        }

        // Send via Brevo
        try {
          const template = magicLinkEmail(url, email);
          await sendEmail({
            to: { email },
            subject: template.subject,
            htmlContent: template.html,
            textContent: template.text,
            tags: ["magic-link", "auth"],
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
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=true",
    error: "/login?error=true",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // User is created by the adapter's createUser override above.
      // Here we only need to block deactivated users.
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (existingUser && !existingUser.isActive) {
        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            organizationId: true,
            mfaEnabled: true,
            totpVerified: true,
          },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.mfaEnabled = dbUser.mfaEnabled;
          token.totpVerified = dbUser.totpVerified;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as Record<string, unknown>).id = token.userId;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).organizationId = token.organizationId;
      }
      return session;
    },
  },
};

