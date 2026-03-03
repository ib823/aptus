"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Minus, Shield, ShieldCheck, Users, Lock } from "lucide-react";

interface RoleInfo {
  id: string;
  label: string;
  description: string;
  category: "platform" | "partner" | "assessment" | "client";
  hierarchyLevel: number;
  validOrgTypes: string[];
  mfaDefault: "required" | "optional" | "disabled";
  canCreateAssessments: boolean;
  canManageUsers: boolean;
  keyCapabilities: {
    canCreateAssessment: boolean;
    canEditAssessment: boolean;
    canManageOrganization: boolean;
    canInviteUsers: boolean;
    canSignOff: boolean;
    isAreaLocked: boolean;
  };
}

interface RolesPermissionsClientProps {
  roles: RoleInfo[];
  permissionMatrix: Record<string, string[]>;
}

type OrgTypeFilter = "ALL" | "PLATFORM" | "PARTNER" | "DIRECT_CLIENT";

const CATEGORY_COLORS: Record<string, string> = {
  platform: "bg-red-100 text-red-800",
  partner: "bg-purple-100 text-purple-800",
  assessment: "bg-blue-100 text-blue-800",
  client: "bg-green-100 text-green-800",
};

const MFA_COLORS: Record<string, string> = {
  required: "bg-red-100 text-red-700",
  optional: "bg-amber-100 text-amber-700",
  disabled: "bg-slate-100 text-slate-500",
};

/** Permission domains and their actions for the matrix table */
const PERMISSION_DOMAINS: Array<{ domain: string; actions: Array<{ key: string; label: string }> }> = [
  {
    domain: "Assessment",
    actions: [
      { key: "assessment.create", label: "Create" },
      { key: "assessment.view", label: "View" },
      { key: "assessment.edit", label: "Edit" },
      { key: "assessment.delete", label: "Delete" },
      { key: "assessment.transition", label: "Transition" },
    ],
  },
  {
    domain: "Profile",
    actions: [
      { key: "profile.edit", label: "Edit" },
    ],
  },
  {
    domain: "Scope",
    actions: [
      { key: "scope.edit", label: "Edit" },
      { key: "scope.bulkSelect", label: "Bulk Select" },
    ],
  },
  {
    domain: "Step Review",
    actions: [
      { key: "step.classify", label: "Classify" },
      { key: "step.addNote", label: "Add Note" },
    ],
  },
  {
    domain: "Gap Resolution",
    actions: [
      { key: "gap.create", label: "Create" },
      { key: "gap.edit", label: "Edit" },
      { key: "gap.approve", label: "Approve" },
      { key: "gap.addAlternative", label: "Add Alternative" },
    ],
  },
  {
    domain: "Integration Register",
    actions: [
      { key: "integration.create", label: "Create" },
      { key: "integration.edit", label: "Edit" },
      { key: "integration.delete", label: "Delete" },
      { key: "integration.approve", label: "Approve" },
    ],
  },
  {
    domain: "Data Migration Register",
    actions: [
      { key: "dataMigration.create", label: "Create" },
      { key: "dataMigration.edit", label: "Edit" },
      { key: "dataMigration.delete", label: "Delete" },
      { key: "dataMigration.approve", label: "Approve" },
    ],
  },
  {
    domain: "OCM Register",
    actions: [
      { key: "ocm.create", label: "Create" },
      { key: "ocm.edit", label: "Edit" },
      { key: "ocm.delete", label: "Delete" },
      { key: "ocm.approve", label: "Approve" },
    ],
  },
  {
    domain: "Organization",
    actions: [
      { key: "org.manage", label: "Manage" },
      { key: "org.viewAll", label: "View All" },
    ],
  },
  {
    domain: "User Management",
    actions: [
      { key: "user.invite", label: "Invite" },
      { key: "user.deactivate", label: "Deactivate" },
      { key: "user.changeRole", label: "Change Role" },
    ],
  },
  {
    domain: "Reports",
    actions: [
      { key: "report.view", label: "View" },
      { key: "report.export", label: "Export" },
    ],
  },
  {
    domain: "Sign-off",
    actions: [
      { key: "signoff.execute", label: "Execute" },
    ],
  },
  {
    domain: "Workshop",
    actions: [
      { key: "workshop.create", label: "Create" },
      { key: "workshop.facilitate", label: "Facilitate" },
    ],
  },
  {
    domain: "Admin",
    actions: [
      { key: "admin.accessPanel", label: "Access Panel" },
    ],
  },
];

export function RolesPermissionsClient({ roles, permissionMatrix }: RolesPermissionsClientProps) {
  const [filter, setFilter] = useState<OrgTypeFilter>("ALL");

  const filteredRoles = filter === "ALL"
    ? roles
    : roles.filter((r) => r.validOrgTypes.includes(filter));

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* Org type filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as OrgTypeFilter)}>
          <TabsList>
            <TabsTrigger value="ALL">All ({roles.length})</TabsTrigger>
            <TabsTrigger value="PLATFORM">
              Platform ({roles.filter((r) => r.validOrgTypes.includes("PLATFORM")).length})
            </TabsTrigger>
            <TabsTrigger value="PARTNER">
              Partner ({roles.filter((r) => r.validOrgTypes.includes("PARTNER")).length})
            </TabsTrigger>
            <TabsTrigger value="DIRECT_CLIENT">
              Direct Client ({roles.filter((r) => r.validOrgTypes.includes("DIRECT_CLIENT")).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Role cards grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Role Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRoles.map((role) => (
              <Card key={role.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{role.label}</CardTitle>
                    <Badge className={CATEGORY_COLORS[role.category] ?? ""} variant="secondary">
                      {role.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Hierarchy Level</span>
                      <span className="font-medium">{role.hierarchyLevel}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">MFA Policy</span>
                      <Badge className={`${MFA_COLORS[role.mfaDefault] ?? ""} text-[10px]`} variant="secondary">
                        {role.mfaDefault}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Org Types</span>
                      <div className="flex gap-1">
                        {role.validOrgTypes.map((ot) => (
                          <Badge key={ot} variant="outline" className="text-[10px] px-1.5">
                            {ot === "DIRECT_CLIENT" ? "Client" : ot.charAt(0) + ot.slice(1).toLowerCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="border-t pt-2 mt-2 flex flex-wrap gap-1.5">
                      {role.keyCapabilities.canCreateAssessment && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <ShieldCheck className="w-3 h-3" /> Create
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Can create assessments</TooltipContent>
                        </Tooltip>
                      )}
                      {role.keyCapabilities.canEditAssessment && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Shield className="w-3 h-3" /> Edit
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Can edit assessments</TooltipContent>
                        </Tooltip>
                      )}
                      {role.keyCapabilities.canManageOrganization && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Users className="w-3 h-3" /> Org
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Can manage organization</TooltipContent>
                        </Tooltip>
                      )}
                      {role.keyCapabilities.canInviteUsers && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Users className="w-3 h-3" /> Invite
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Can invite users</TooltipContent>
                        </Tooltip>
                      )}
                      {role.keyCapabilities.canSignOff && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Check className="w-3 h-3" /> Sign-off
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Can execute sign-off</TooltipContent>
                        </Tooltip>
                      )}
                      {role.keyCapabilities.isAreaLocked && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] gap-1 border-amber-300">
                              <Lock className="w-3 h-3" /> Area-locked
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Access restricted to assigned functional areas</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Permission matrix table */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Permission Matrix</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground sticky left-0 bg-slate-50 min-w-[180px]">
                    Domain / Action
                  </th>
                  {filteredRoles.map((role) => (
                    <th key={role.id} className="px-2 py-2.5 text-center font-medium text-muted-foreground min-w-[80px]">
                      <Tooltip>
                        <TooltipTrigger className="cursor-default">
                          <span className="block truncate max-w-[80px]">{role.label}</span>
                        </TooltipTrigger>
                        <TooltipContent>{role.description}</TooltipContent>
                      </Tooltip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_DOMAINS.map((domain) => (
                  <>
                    {/* Domain header row */}
                    <tr key={`domain-${domain.domain}`} className="bg-slate-50/50">
                      <td
                        colSpan={filteredRoles.length + 1}
                        className="px-3 py-1.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider sticky left-0 bg-slate-50/50"
                      >
                        {domain.domain}
                      </td>
                    </tr>
                    {/* Action rows */}
                    {domain.actions.map((action) => (
                      <tr key={action.key} className="border-b border-slate-100 hover:bg-slate-50/30">
                        <td className="px-3 py-1.5 pl-6 text-muted-foreground sticky left-0 bg-white">
                          {action.label}
                        </td>
                        {filteredRoles.map((role) => {
                          const hasPermission = permissionMatrix[role.id]?.includes(action.key);
                          return (
                            <td key={role.id} className="px-2 py-1.5 text-center">
                              {hasPermission ? (
                                <Check className="w-3.5 h-3.5 text-green-600 mx-auto" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
