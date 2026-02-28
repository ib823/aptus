import { FileText } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText className="w-12 h-12 text-slate-300 mb-4" />
      <h3 className="text-lg font-medium text-slate-500 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-md">{description}</p>
      {action}
    </div>
  );
}
