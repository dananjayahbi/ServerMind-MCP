interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-[#2A2A2A] bg-[#111111]">
      <div>
        <h1 className="text-[18px] font-bold text-[#F2F2F2]">{title}</h1>
        {description && (
          <p className="text-[13px] text-[#666666] mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
