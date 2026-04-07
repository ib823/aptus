import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export const metadata: Metadata = { title: "Users" };

interface UsersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 100;

  const totalCount = await prisma.user.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(page, totalPages);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  const startItem = totalCount === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const endItem = Math.min(totalCount, startItem + users.length - 1);

  // Serialize dates for client component
  const serializedUsers = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-1">Users</h1>
      <p className="text-base text-muted-foreground mb-8">
        All registered users ({totalCount})
      </p>

      <AdminUsersClient
        initialUsers={serializedUsers}
        currentUserId={user.id}
      />

      <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {startItem}-{endItem} of {totalCount}
        </span>
        <div className="flex items-center gap-2">
          {clampedPage > 1 ? (
            <a
              href={`/admin/users?page=${clampedPage - 1}`}
              className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
            >
              Previous
            </a>
          ) : (
            <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
              Previous
            </span>
          )}
          <span className="text-xs">
            Page {clampedPage} of {totalPages}
          </span>
          {clampedPage < totalPages ? (
            <a
              href={`/admin/users?page=${clampedPage + 1}`}
              className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
            >
              Next
            </a>
          ) : (
            <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
              Next
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
