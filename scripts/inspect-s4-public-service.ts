/**
 * Inspect an SAP S/4HANA Cloud Public Edition OData service.
 *
 * Public Cloud does not expose raw database tables over HTTP. What we can read
 * are released API entity sets from the service metadata, for example
 * A_PurchaseOrder or A_SupplierInvoice.
 *
 * Required env is the same as scripts/smoke-s4-public-api.ts:
 *   S4_TDD_BASE_URL
 *   S4_TDD_AUTH_TYPE=basic|bearer|oauth-client-credentials
 *   ...corresponding credentials
 *
 * Required (2608: the PO service is OData V4 — API_PURCHASEORDER_PROCESS_SRV is deprecated):
 *   S4_TDD_SERVICE_PATH=/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001
 *
 * Optional:
 *   S4_TDD_ENTITY_LIMIT=20
 *   S4_TDD_PROBE_ENTITIES=1
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

type AuthType = "basic" | "bearer" | "oauth-client-credentials";

interface EntitySet {
  name: string;
  entityType: string;
}

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

function normalizePath(raw: string): string {
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.replace(/\/+$/, "");
}

async function fetchOAuthToken(): Promise<string> {
  const tokenUrl = required("S4_TDD_OAUTH_TOKEN_URL");
  const clientId = required("S4_TDD_CLIENT_ID");
  const clientSecret = required("S4_TDD_CLIENT_SECRET");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const json = (await response.json()) as { access_token?: unknown };
  if (!response.ok || typeof json.access_token !== "string") {
    throw new Error(`OAuth token request failed: HTTP ${response.status}`);
  }
  return json.access_token;
}

async function buildAuthHeader(authType: AuthType): Promise<string> {
  if (authType === "basic") {
    return `Basic ${Buffer.from(`${required("S4_TDD_USERNAME")}:${required("S4_TDD_PASSWORD")}`).toString("base64")}`;
  }
  if (authType === "bearer") {
    return `Bearer ${required("S4_TDD_BEARER_TOKEN")}`;
  }
  return `Bearer ${await fetchOAuthToken()}`;
}

function parseEntitySets(metadataXml: string): EntitySet[] {
  const entitySets: EntitySet[] = [];
  const re = /<EntitySet\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(metadataXml)) !== null) {
    const attrs = match[1] ?? "";
    const name = attrs.match(/\bName="([^"]+)"/)?.[1];
    const entityType = attrs.match(/\bEntityType="([^"]+)"/)?.[1];
    if (name && entityType) {
      entitySets.push({ name, entityType });
    }
  }
  return entitySets;
}

async function probeEntitySet(
  serviceUrl: string,
  entitySetName: string,
  authHeader: string,
): Promise<Record<string, unknown>> {
  const url = new URL(`${serviceUrl}/${entitySetName}?$top=1&$format=json`);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const durationMs = Date.now() - startedAt;
  const text = await response.text();

  const result: Record<string, unknown> = {
    name: entitySetName,
    ok: response.ok,
    status: response.status,
    durationMs,
  };

  if (response.headers.get("content-type")?.includes("application/json") && text) {
    const json = JSON.parse(text) as {
      d?: { results?: unknown[] };
      value?: unknown[];
      error?: unknown;
    };
    const rows = json.d?.results ?? json.value;
    if (Array.isArray(rows)) {
      result.resultCount = rows.length;
      result.firstResultKeys =
        rows[0] && typeof rows[0] === "object"
          ? Object.keys(rows[0] as Record<string, unknown>).slice(0, 12)
          : [];
    } else if (json.error) {
      result.hasErrorBody = true;
    }
  } else if (text) {
    result.bodyPreview = text.slice(0, 160);
  }

  return result;
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(required("S4_TDD_BASE_URL"));
  const servicePath = normalizePath(required("S4_TDD_SERVICE_PATH"));
  const serviceUrl = `${baseUrl}${servicePath}`;
  const authType = (process.env.S4_TDD_AUTH_TYPE ?? "basic") as AuthType;
  if (!["basic", "bearer", "oauth-client-credentials"].includes(authType)) {
    throw new Error("Invalid S4_TDD_AUTH_TYPE");
  }

  const authHeader = await buildAuthHeader(authType);
  const metadataResponse = await fetch(`${serviceUrl}/$metadata`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/xml, text/xml, */*",
    },
  });

  const metadataXml = await metadataResponse.text();
  if (!metadataResponse.ok) {
    console.log(
      JSON.stringify(
        {
          servicePath,
          metadata: {
            ok: false,
            status: metadataResponse.status,
            preview: metadataXml.slice(0, 300),
          },
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const limit = Number.parseInt(process.env.S4_TDD_ENTITY_LIMIT ?? "20", 10);
  const entitySets = parseEntitySets(metadataXml);
  const listed = entitySets.slice(0, limit);

  const output: Record<string, unknown> = {
    servicePath,
    metadata: {
      ok: true,
      status: metadataResponse.status,
    },
    entitySetCount: entitySets.length,
    entitySets: listed,
  };

  if (process.env.S4_TDD_PROBE_ENTITIES === "1") {
    output.probes = await Promise.all(
      listed.map((entitySet) => probeEntitySet(serviceUrl, entitySet.name, authHeader)),
    );
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
