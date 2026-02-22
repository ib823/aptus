import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

const handler = NextAuth(authOptions);

export const preferredRegion = "sin1";

export { handler as GET, handler as POST };
