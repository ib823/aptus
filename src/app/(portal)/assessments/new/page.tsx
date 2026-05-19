import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getCapabilities } from "@/lib/auth/role-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UI_TEXT } from "@/constants/ui-text";
import { NewAssessmentForm } from "@/components/assessment/NewAssessmentForm";

export default async function NewAssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!getCapabilities(mapLegacyRole(user.role)).canCreateAssessment) {
    redirect("/assessments");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {UI_TEXT.assessment.createNew}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            An assessment evaluates how well SAP standard processes fit your
            company. You&apos;ll define scope, review process steps, and
            identify gaps. Start by entering basic company details below.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">1</span>
              Company Info
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="inline-flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px]">2</span>
              Profile
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="inline-flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px]">3</span>
              Scope
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="inline-flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px]">4</span>
              Review
            </span>
          </div>
          <NewAssessmentForm />
        </CardContent>
      </Card>
    </div>
  );
}
