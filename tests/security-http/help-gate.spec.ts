import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error("TEST_DATABASE_URL is required for HTTP session fixtures.");
const db = new PrismaClient({ datasourceUrl: databaseURL });
const userIds: string[] = [];
const cookies: Record<string, string> = {
  missing: "", forged: "abeam-session=invalid-test-cookie",
  "forged NextAuth": "next-auth.session-token=invalid-test-cookie",
};
const pages = [
  ["/help", "One app, three workspaces, three audiences."],
  ["/help/control-tower/grants", "What this screen will not tell you"],
  ["/help/developer-guide", "CoreEdge for developers"],
] as const;

test.beforeAll(async () => {
  const user = await db.user.create({ data: {
    email: "help-test-" + randomUUID() + "@example.test", name: "Help gate test", role: "consultant",
  } });
  userIds.push(user.id);
  const inactive = await db.user.create({ data: {
    email: "help-test-" + randomUUID() + "@example.test", name: "Inactive test",
    role: "consultant", isActive: false,
  } });
  userIds.push(inactive.id);
  for (const state of ["valid", "expired", "revoked", "inactive"]) {
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: {
      userId: state === "inactive" ? inactive.id : user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + (state === "expired" ? -60_000 : 3600_000)),
      isRevoked: state === "revoked",
      revokedAt: state === "revoked" ? new Date() : null,
    } });
    cookies[state] = "abeam-session=" + token;
  }
});

test.afterAll(async () => {
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

for (const [path, marker] of pages) {
  for (const flight of [false, true]) {
    for (const state of ["missing", "forged", "forged NextAuth", "expired", "revoked", "inactive"]) {
      test(path + " refuses " + state + (flight ? " RSC" : " HTML"), async ({ request }) => {
        const response = await request.get(path, {
          headers: { Cookie: cookies[state]!, ...(flight ? { RSC: "1" } : {}) },
          maxRedirects: 0,
        });
        const body = await response.text();
        // Flight may stream a redirect with HTTP 200. It must contain no page
        // content; checking just a redirect or status would miss the original leak.
        expect(body).not.toContain(marker);
        expect(response.status() === 307 || body.includes("NEXT_REDIRECT")).toBe(true);
      });
    }
    test(path + " allows valid session" + (flight ? " RSC" : " HTML"), async ({ request }) => {
      const response = await request.get(path, {
        headers: { Cookie: cookies.valid!, ...(flight ? { RSC: "1" } : {}) },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(marker);
    });
  }
}
