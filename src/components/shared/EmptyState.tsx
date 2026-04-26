import { FileText } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText className="w-12 h-12 mb-4" style={{ color: "var(--aptus-text-subtle)" }} />
      <h3 className="text-lg font-medium mb-1" style={{ color: "var(--aptus-text)" }}>{title}</h3>
      <p className="text-sm mb-6 max-w-md" style={{ color: "var(--aptus-text-muted)" }}>{description}</p>
      {action}
    </div>
  );
}
