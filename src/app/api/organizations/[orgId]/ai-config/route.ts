import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { AIConfig } from "@/lib/intelligence/ai-orchestrator";

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
    const { provider, apiKey, endpoint, modelName } = body;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { aiConfig: true }
    });

    const currentConfig = (org?.aiConfig as unknown as AIConfig) || {};
    
    const newConfig: Partial<AIConfig> = {
      ...currentConfig,
      provider,
      endpoint,
      modelName,
    };

    // Only update API key if provided (not masked)
    if (apiKey && apiKey !== "********") {
      // In a real production app, we would encrypt this using a KMS or crypto library
      // For this implementation, we store it in the JSON field.
      newConfig.apiKey = apiKey;
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
