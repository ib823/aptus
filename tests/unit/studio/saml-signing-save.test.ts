/**
 * Saving a signing SuccessFactors connection — what the route refuses, and
 * what it stores, before anything is sealed.
 *
 * Each case here was a value that saved cleanly and then failed every token
 * exchange behind a misleading reason: a user id with surrounding whitespace
 * ("invalid user"), a control character pasted from a spreadsheet (a document
 * no parser accepts, reported as a key problem), and a key copied out of a
 * .env file with its line breaks as `\n` (refused as "not PEM").
 */

import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  upsert: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findFirst: mocks.findFirstConnection } },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolverModule>();
  return { ...actual, upsertSapConnection: mocks.upsert };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { POST } from "@/app/api/studio/connections/route";

const CONSULTANT = { id: "u_1", role: "consultant", organizationId: "org_a", email: "c@abeam.com", authMethod: "session" };
const KEY_PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;

function body(over: Record<string, unknown> = {}) {
  return {
    product: "successfactors",
    key: "zvcsf",
    label: "SuccessFactors",
    baseUrl: "https://api4.successfactors.com",
    environment: "DEV",
    authType: "oauth-saml-bearer",
    clientId: "MzM4ZmQ3ZTQ0OGU2",
    companyId: "acmeT1",
    oauthTokenUrl: "https://api4.successfactors.com/oauth/token",
    samlPrivateKey: KEY_PEM,
    samlUserId: "sfadmin",
    ...over,
  };
}

function request(payload: unknown) {
  return new Request("https://example.test/api/studio/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

async function refusal(res: Response): Promise<string> {
  expect(res.status).toBe(400);
  return JSON.stringify(await res.json());
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
  mocks.findFirstConnection.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ id: "conn_zvcsf", product: "successfactors", key: "zvcsf" });
  mocks.writeConfigAudit.mockResolvedValue(undefined);
});

describe("the user id", () => {
  it("is stored trimmed", async () => {
    const res = await POST(request(body({ samlUserId: "  sfadmin\n" })));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ secrets: expect.objectContaining({ samlUserId: "sfadmin" }) }),
    );
  });

  it("is refused when it is only whitespace", async () => {
    expect(await refusal(await POST(request(body({ samlUserId: "   " }))))).toContain("samlUserId");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("whitespace is missing, as it is to the exchange", () => {
  it.each([
    [{ clientId: "   " }, "clientId"],
    [{ companyId: " \n " }, "companyId"],
    [{ samlPrivateKey: undefined, samlUserId: undefined, samlAssertion: "   " }, "samlAssertion"],
  ] as const)("refuses %j", async (over, field) => {
    expect(await refusal(await POST(request(body(over))))).toContain(field);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("the token URL is the Recipient, so it must be the URL posted to", () => {
  it.each(["https://api4.successfactors.com/oauth/\ttoken", "https://api4.successfactors.com/oauth/\ntoken"])(
    "refuses %j, which fetch would post to without the whitespace the assertion signs",
    async (oauthTokenUrl) => {
      expect(await refusal(await POST(request(body({ oauthTokenUrl }))))).toContain("tab or line break");
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );
});

describe("a URL carrying a user name or password is refused", () => {
  it.each(["oauthTokenUrl", "baseUrl"] as const)("in %s", async (field) => {
    const url = field === "baseUrl" ? "https://svc:pw@api4.successfactors.com" : "https://svc:pw@api4.successfactors.com/oauth/token";
    expect(await refusal(await POST(request(body({ [field]: url }))))).toContain("user name or password");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("a character XML cannot carry is refused where it was typed", () => {
  it.each(["clientId", "samlUserId"] as const)("in %s", async (field) => {
    // Inside the value: a trailing vertical tab is whitespace, and trimmed.
    const said = await refusal(await POST(request(body({ [field]: "jd\u000boe" }))));
    expect(said).toContain("control character");
    expect(said).toContain(field);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("the key", () => {
  it("is accepted with its line breaks written as \\n, as the env path accepts it", async () => {
    const res = await POST(request(body({ samlPrivateKey: KEY_PEM.replace(/\n/g, "\\n") })));
    expect(res.status).toBe(200);
  });

  it("is still refused when it cannot sign, with a sentence that does not echo it", async () => {
    const said = await refusal(await POST(request(body({ samlPrivateKey: "not-a-key-SECRETISH" }))));
    expect(said).toContain("signing key cannot be used");
    expect(said).not.toContain("SECRETISH");
  });
});
