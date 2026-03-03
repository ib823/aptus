interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3 mb-8">
      <div className="min-w-0">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ color: "var(--sapGroup_TitleTextColor, #1d2d3e)" }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="mt-1 text-base"
            style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
