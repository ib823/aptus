import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { CompanyProfileForm } from "@/components/profile/CompanyProfileForm";

export default async function PersonalProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="My Profile" />
      <div className="bg-card rounded-lg border p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Account Information</h2>
        <div className="space-y-4 mb-8">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Full Name</label>
            <p className="text-base font-medium">{user.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email Address</label>
            <p className="text-base font-medium">{user.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Platform Role</label>
            <p className="text-base font-medium uppercase text-blue-600">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        
        <div className="border-t pt-8">
          <h2 className="text-lg font-semibold mb-4">Organization Profile</h2>
          <CompanyProfileForm />
        </div>
      </div>
    </div>
  );
}
