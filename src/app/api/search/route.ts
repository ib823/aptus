import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    // 1. Search Scope Items (SAP Catalog)
    const scopeItems = await prisma.scopeItem.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { nameClean: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: {
        id: true,
        nameClean: true,
      },
    });

    // 2. Search Assessments (User's assessments or platform admin access)
    const assessments = await prisma.assessment.findMany({
      where: {
        ...(user.role !== "platform_admin"
          ? {
              stakeholders: {
                some: {
                  userId: user.id,
                },
              },
            }
          : {}),
        companyName: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: {
        id: true,
        companyName: true,
        status: true,
      },
    });

    return NextResponse.json({
      data: {
        scopeItems: scopeItems.map((s) => ({
          id: s.id,
          title: `${s.id}: ${s.nameClean}`,
          href: `/assessment/catalog/${s.id}`, // Default catalog view
          type: "Scope Item",
        })),
        assessments: assessments.map((a) => ({
          id: a.id,
          title: a.companyName,
          href: `/assessment/${a.id}/scope`,
          type: "Assessment",
          status: a.status,
        })),
      },
    });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
