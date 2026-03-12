import { afterEach, describe, expect, it } from "vitest";
import { getTrustedAppOrigin } from "@/lib/http/app-origin";

const originalNextAuthUrl = process.env.NEXTAUTH_URL;
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

describe("getTrustedAppOrigin", () => {
  afterEach(() => {
    if (originalNextAuthUrl === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = originalNextAuthUrl;
    }

    if (originalPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
    }
  });

  it("prefers NEXT_PUBLIC_APP_URL over request origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/some/path";
    process.env.NEXTAUTH_URL = "https://auth.example.com";

    const origin = getTrustedAppOrigin(new Request("https://request.example.com/api/test"));

    expect(origin).toBe("https://app.example.com");
  });

  it("falls back to NEXTAUTH_URL when NEXT_PUBLIC_APP_URL is absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = "https://auth.example.com/login";

    const origin = getTrustedAppOrigin(new Request("https://request.example.com/api/test"));

    expect(origin).toBe("https://auth.example.com");
  });

  it("falls back to the request origin when configured env vars are invalid", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url";
    process.env.NEXTAUTH_URL = "also-not-a-url";

    const origin = getTrustedAppOrigin(new Request("https://request.example.com/api/test"));

    expect(origin).toBe("https://request.example.com");
  });
});
