interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3 mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-950 tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-base text-gray-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
