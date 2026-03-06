import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encryptApiKey } from "@/lib/intelligence/ai-key-crypto";
import type { AIConfig } from "@/lib/intelligence/ai-orchestrator";

const UpdateAIConfigSchema = z.object({
  provider: z.enum(["openai", "azure", "gemini"]),
  apiKey: z.string().optional(),
  endpoint: z.string().url().optional(),
  modelName: z.string().max(100).optional(),
});

const AZURE_ENDPOINT_RE =
  /^https:\/\/[a-zA-Z0-9-]+\.openai\.azure\.com\//;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const user = await getCurrentUser();
  const { orgId } = await params;

  if (!user || (user.organizationId !== orgId && user.role !== "platform_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only partner_lead or admins can change AI config
  if (!["partner_lead", "admin", "platform_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = UpdateAIConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { provider, apiKey, endpoint, modelName } = parsed.data;

    // Validate Azure endpoint format server-side
    if (provider === "azure" && endpoint && !AZURE_ENDPOINT_RE.test(endpoint)) {
      return NextResponse.json(
        { error: "Azure endpoint must match https://{name}.openai.azure.com/..." },
        { status: 400 },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { aiConfig: true }
    });

    const currentConfig = (org?.aiConfig as unknown as AIConfig) || {};

    const newConfig: Partial<AIConfig> = {
      ...currentConfig,
      provider,
    };
    if (endpoint !== undefined) newConfig.endpoint = endpoint;
    if (modelName !== undefined) newConfig.modelName = modelName;

    // Only update API key if provided (not masked)
    if (apiKey && apiKey !== "********") {
      newConfig.apiKey = encryptApiKey(apiKey);
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { aiConfig: newConfig },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AI Config Update Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
