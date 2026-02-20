import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PermissionDeniedProps {
  title?: string | undefined;
  message?: string | undefined;
  requiredArea?: string | undefined;
  userRole?: string | undefined;
}

export function PermissionDenied({
  title = "Access Restricted",
  message = "You do not have permission to perform this action.",
  requiredArea,
  userRole,
}: PermissionDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldAlert className="w-12 h-12 text-amber-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-950 mb-1">{title}</h3>
      <p className="text-base text-gray-600 mb-4 max-w-md">{message}</p>
      {requiredArea && (
        <p className="text-sm text-gray-500 mb-4">
          Required functional area: <span className="font-medium text-gray-700">{requiredArea}</span>
        </p>
      )}
      {userRole && (
        <p className="text-sm text-gray-500 mb-6">
          Your role: <span className="font-medium text-gray-700">{userRole}</span>
        </p>
      )}
      <Button variant="outline" onClick={() => window.history.back()}>
        Go Back
      </Button>
    </div>
  );
}
