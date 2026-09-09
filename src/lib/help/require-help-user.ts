import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

/** Every help page must await this before reading or rendering its content.
 * Layouts render concurrently with pages and cannot protect their RSC payload.
 */
export async function requireHelpUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  return user;
}
