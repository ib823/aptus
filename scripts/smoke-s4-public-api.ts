/**
 * Smoke-test a read-only SAP S/4HANA Cloud Public Edition API endpoint.
 *
 * This is intentionally generic: point it at any GET endpoint enabled in the
 * TDD tenant's Communication Arrangement. Defaults to Business Partner A2X.
 *
 * Required:
 *   S4_TDD_BASE_URL=https://myXXXXXX-api.s4hana.cloud.sap
 *
 * Auth, choose one:
 *   S4_TDD_AUTH_TYPE=basic
 *   S4_TDD_USERNAME=...
 *   S4_TDD_PASSWORD=...
 *
 *   S4_TDD_AUTH_TYPE=bearer
 *   S4_TDD_BEARER_TOKEN=...
 *
 *   S4_TDD_AUTH_TYPE=oauth-client-credentials
 *   S4_TDD_OAUTH_TOKEN_URL=https://.../oauth/token
 *   S4_TDD_CLIENT_ID=...
 *   S4_TDD_CLIENT_SECRET=...
 *
 * Optional:
 *   S4_TDD_API_PATH=/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1&$format=json
 *   S4_TDD_ACCEPT=application/json
 *   S4_TDD_TIMEOUT_MS=15000
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

type AuthType = "basic" | "bearer" | "oauth-client-credentials";

const DEFAULT_PATH =
  "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1&$format=json";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function buildEndpoint(baseUrl: string, apiPath: string): URL {
  if (/^https?:\/\//i.test(apiPath)) {
    return new URL(apiPath);
  }

  const cleanPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return new URL(`${baseUrl}${cleanPath}`);
}

async function fetchOAuthToken(): Promise<string> {
  const tokenUrl = required("S4_TDD_OAUTH_TOKEN_URL");
  const clientId = required("S4_TDD_CLIENT_ID");
  const clientSecret = required("S4_TDD_CLIENT_SECRET");

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OAuth token request failed: HTTP ${response.status} ${response.statusText}`);
  }

  const json = JSON.parse(text) as { access_token?: unknown };
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("OAuth token response did not contain access_token");
  }
  return json.access_token;
}

async function buildAuthHeader(authType: AuthType): Promise<string> {
  if (authType === "basic") {
    const username = required("S4_TDD_USERNAME");
    const password = required("S4_TDD_PASSWORD");
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  if (authType === "bearer") {
    return `Bearer ${required("S4_TDD_BEARER_TOKEN")}`;
  }

  return `Bearer ${await fetchOAuthToken()}`;
}

function summarizeJson(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const d = obj.d as Record<string, unknown> | undefined;
  const v2Results = d?.results;
  if (Array.isArray(v2Results)) {
    return {
      shape: "odata-v2",
      resultCount: v2Results.length,
      firstResultKeys:
        v2Results[0] && typeof v2Results[0] === "object"
          ? Object.keys(v2Results[0] as Record<string, unknown>).slice(0, 12)
          : [],
    };
  }

  const v4Value = obj.value;
  if (Array.isArray(v4Value)) {
    return {
      shape: "odata-v4",
      resultCount: v4Value.length,
      firstResultKeys:
        v4Value[0] && typeof v4Value[0] === "object"
          ? Object.keys(v4Value[0] as Record<string, unknown>).slice(0, 12)
          : [],
    };
  }

  return {
    shape: "json",
    topLevelKeys: Object.keys(obj).slice(0, 20),
  };
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(required("S4_TDD_BASE_URL"));
  const authType = (process.env.S4_TDD_AUTH_TYPE ?? "basic") as AuthType;
  if (!["basic", "bearer", "oauth-client-credentials"].includes(authType)) {
    throw new Error(
      "S4_TDD_AUTH_TYPE must be one of: basic, bearer, oauth-client-credentials",
    );
  }

  const endpoint = buildEndpoint(baseUrl, process.env.S4_TDD_API_PATH ?? DEFAULT_PATH);
  const accept =
    process.env.S4_TDD_ACCEPT ??
    (endpoint.pathname.endsWith("/$metadata")
      ? "application/xml, text/xml, */*"
      : "application/json");
  const timeoutMs = Number.parseInt(process.env.S4_TDD_TIMEOUT_MS ?? "15000", 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startedAt = Date.now();
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: await buildAuthHeader(authType),
        Accept: accept,
      },
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    const result: Record<string, unknown> = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      endpoint: `${endpoint.origin}${endpoint.pathname}${endpoint.search}`,
      contentType,
    };

    if (contentType.includes("application/json") && text) {
      result.bodySummary = summarizeJson(JSON.parse(text));
    } else {
      result.bodyPreview = text.slice(0, 500);
    }

    console.log(JSON.stringify(result, null, 2));

    if (!response.ok) {
      process.exitCode = 1;
    }
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
