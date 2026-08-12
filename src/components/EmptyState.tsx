import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Mode ringkas untuk sel tabel / panel kecil */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-md bg-muted text-muted-foreground">{icon}</div>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
