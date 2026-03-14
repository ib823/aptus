import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { getOrgTypeLabel, getOrgTypeColor } from "@/lib/utils/org-type";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage() {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      ssoEnabled: true,
      mfaPolicy: true,
      createdAt: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">Organizations</h1>
      <p className="text-base text-muted-foreground mb-8">
        Manage all organizations ({organizations.length})
      </p>

      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Users</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">SSO</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">MFA Policy</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {org.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{org.slug}</div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge className={getOrgTypeColor(org.type)}>
                    {getOrgTypeLabel(org.type)}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{org._count.users}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${org.ssoEnabled ? "text-green-600" : "text-muted-foreground/60"}`}>
                    {org.ssoEnabled ? "Enabled" : "Off"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                  {org.mfaPolicy ?? "optional"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground/60">
                  {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
