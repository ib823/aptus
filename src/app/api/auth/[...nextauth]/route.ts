import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
