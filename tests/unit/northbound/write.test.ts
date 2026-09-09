// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { writeEntitySet, writeHttpStatusFor } from "@/lib/northbound/write";
import { extractCookies } from "@/lib/sap-public/cookies";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

const connection: ResolvedSapConnection = {
  source: "db", id: "c1", organizationId: "org_a", product: "s4hana", key: "sandbox",
  label: "Test", baseUrl: "https://sap.example", authType: "basic",
  secrets: { username: "u", password: "p" }, oauthTokenUrl: null, writeEnabled: true,
  apiPath: null, timeoutMs: null, environment: "SANDBOX", client: "100",
};
const input = { connection, servicePath: "/sap/odata/API_TEST", entitySet: "A_Thing", payload: { Name: "Test" } };
function handshake() {
  const headers = new Headers({ "x-csrf-token": "csrf-test" });
  headers.append("set-cookie", "SAP_SESSION=abc==; Path=/; Secure; HttpOnly");
  headers.append("set-cookie", "sap-usercontext=sap-client=100; Expires=Wed, 09 Sep 2026 23:59:59 GMT; SameSite=Lax");
  return new Response("", { headers });
}
describe("CSRF session cookie forwarding", () => {
  it("sends each cookie pair once without response attributes", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(
      Response.json({ d: { ID: "1" } }, { status: 201 }),
    );
    expect((await writeEntitySet(input, f)).status).toBe("CREATED");
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBe("SAP_SESSION=abc==; sap-usercontext=sap-client=100");
    expect(headers.get("x-csrf-token")).toBe("csrf-test");
    expect(url).toContain("sap-client=100");
    expect(init.method).toBe("POST");
  });
  it("handles combined fields with an Expires comma in runtimes without getSetCookie", () => {
    const headers = { get: () => "one=1; Expires=Wed, 09 Sep 2026 00:00:00 GMT, two=2; Path=/" } as unknown as Headers;
    expect(extractCookies(headers)).toBe("one=1; two=2");
    expect(extractCookies(new Headers())).toBe("");
  });
  it("never writes after a refused CSRF handshake", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    expect((await writeEntitySet(input, f)).status).toBe("NEEDS_SETUP");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
describe("write response validation", () => {
  it.each(["<html>Login</html>", "", "null", "[]", '{"error":{"message":"secret"}}', '{"d":null}'])(
    "refuses an invalid HTTP 200 response: %s", async (body) => {
      const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response(body));
      const result = await writeEntitySet(input, f);
      expect(result.status).toBe("ERROR");
      expect(writeHttpStatusFor(result.status)).toBe(502);
      expect(result.record).toBeNull();
      expect(result.detail).not.toContain("secret");
    },
  );
  it("allows 201 without a representation", async () => {
    const f = vi.fn().mockResolvedValueOnce(handshake()).mockResolvedValueOnce(new Response(null, { status: 201 }));
    expect((await writeEntitySet(input, f)).status).toBe("CREATED");
  });
});
