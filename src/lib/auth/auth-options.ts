/** NextAuth configuration — magic link authentication via Brevo */

import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/brevo";
import { magicLinkEmail } from "@/lib/email/templates";
import type { Adapter } from "next-auth/adapters";
import { canRegister } from "@/lib/auth/auth-config";

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
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=true",
    error: "/login?error=true",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const email = user.email.toLowerCase();

      // 1. Check if user already exists in the system
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      // 2. If user exists, only check if they are active
      if (existingUser) {
        return existingUser.isActive;
      }

      // 3. If user is NEW, enforce the security policy
      const policy = canRegister(email);
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
