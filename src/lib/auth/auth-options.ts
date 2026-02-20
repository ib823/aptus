/** NextAuth configuration — magic link authentication */

import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME } from "./session";
import type { Adapter } from "next-auth/adapters";

/**
 * Custom adapter that wraps Prisma for NextAuth compatibility.
 * We use our own session management on top of NextAuth's magic link flow.
 */
function getAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);
  return {
    ...baseAdapter,
  } as Adapter;
}

export const authOptions: NextAuthOptions = {
  adapter: getAdapter(),
  providers: [
    EmailProvider({
      // In development, magic links are logged to console instead of sent
      server: process.env.EMAIL_SERVER ?? {
        host: "localhost",
        port: 1025,
        auth: { user: "", pass: "" },
      },
      from: process.env.EMAIL_FROM ?? "noreply@bound.dev",
      sendVerificationRequest: async ({ identifier: email, url }) => {
        // In development, log the magic link to console
        if (process.env.NODE_ENV === "development") {
          console.log(`\n[MAGIC LINK] For ${email}:\n${url}\n`);
          return;
        }
        // In production, send actual email
        // TODO: Implement email sending
        console.log(`[EMAIL] Send magic link to ${email}: ${url}`);
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

      // Find or create the user in our User table
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser) {
        // Auto-create user on first magic link sign-in
        // Role defaults to consultant; admin assigns proper role
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name ?? user.email.split("@")[0] ?? "User",
            role: "consultant",
          },
        });
      } else if (!existingUser.isActive) {
        return false; // Deactivated users cannot sign in
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

export { createSession, SESSION_COOKIE_NAME };
