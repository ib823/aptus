import { FileText } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText className="w-12 h-12 mb-4" style={{ color: "var(--sapContent_NonInteractiveIconColor, #bcc3ca)" }} />
      <h3 className="text-lg font-medium mb-1" style={{ color: "var(--sapTextColor, #32363a)" }}>{title}</h3>
      <p className="text-sm mb-6 max-w-md" style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}>{description}</p>
      {action}
    </div>
  );
}
