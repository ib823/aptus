/**
 * GET /api/tobe/[bundleId]/export?format=pdf|pptx|svg[&level=l1|l2&code=BDG]
 *
 * Exports the LATEST stored pack of the bundle — never regenerates, so the
 * file a consultant downloads is the pack they reviewed on screen (same
 * inputs hash). Consultant view: internal notes included. The client surface
 * (/a/tobe) renders from `clientView` and does not link here.
 */
import { NextResponse } from "next/server";

import { requireAffirmBundleAccess } from "@/lib/affirm/authz";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { contentDisposition } from "@/lib/security/filename";
import { generateTobePackPdf } from "@/lib/tobe/export-pdf";
import { generateTobePackPptx } from "@/lib/tobe/export-pptx";
import { isTobePackEnabled } from "@/lib/tobe/guards";
import { latestPack } from "@/lib/tobe/inputs";
import { renderL1Svg, renderL2Svg } from "@/lib/tobe/svg";
import { canPerformAffirmAction } from "@/lib/workbench/rbac";

const FORMATS = new Set(["pdf", "pptx", "svg"]);

function fileStem(client: string, release: string): string {
  const slug =
    client
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "client";
  return `tobe-process-pack-${slug}-${release}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ bundleId: string }> }) {
  if (!isTobePackEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canPerformAffirmAction(user.role, "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { bundleId } = await ctx.params;
  const access = await requireAffirmBundleAccess(bundleId, user);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "pdf";
  if (!FORMATS.has(format)) return NextResponse.json({ error: "invalid_format" }, { status: 400 });

  const [bundle, pack] = await Promise.all([
    prisma.affirmBundle.findUnique({ where: { id: bundleId }, select: { client: true } }),
    latestPack(prisma, bundleId),
  ]);
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!pack) return NextResponse.json({ error: "no_pack" }, { status: 404 });

  const stem = fileStem(bundle.client, pack.doc.release);
  if (format === "svg") {
    const level = url.searchParams.get("level") ?? "l1";
    const code = url.searchParams.get("code");
    let svg: string;
    let name: string;
    if (level === "l2") {
      const item = pack.doc.scopeItems.find((i) => i.code === code);
      if (!item) return NextResponse.json({ error: "unknown_scope_code" }, { status: 400 });
      svg = renderL2Svg(item);
      name = `${stem}-L2-${item.code}.svg`;
    } else {
      svg = renderL1Svg(pack.doc);
      name = `${stem}-L1.svg`;
    }
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": contentDisposition(name, "inline"),
        "Cache-Control": "private, no-store",
        "X-Tobe-Inputs-Hash": pack.inputsHash,
      },
    });
  }
  if (format === "pptx") {
    const buf = await generateTobePackPptx(pack.doc, { clientName: bundle.client, consultantView: true });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": contentDisposition(`${stem}.pptx`, "attachment"),
        "Cache-Control": "private, no-store",
        "X-Tobe-Inputs-Hash": pack.inputsHash,
      },
    });
  }
  const bytes = generateTobePackPdf(pack.doc, { clientName: bundle.client, consultantView: true });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(`${stem}.pdf`, "inline"),
      "Cache-Control": "private, no-store",
      "X-Tobe-Inputs-Hash": pack.inputsHash,
    },
  });
}
