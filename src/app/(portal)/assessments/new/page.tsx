import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyProfileForm } from "@/components/assessment/CompanyProfileForm";
import { UI_TEXT } from "@/constants/ui-text";

export default async function NewAssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role !== "consultant" && user.role !== "admin") {
    redirect("/assessments");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {UI_TEXT.assessment.createNew}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyProfileForm />
        </CardContent>
      </Card>
    </div>
  );
}
