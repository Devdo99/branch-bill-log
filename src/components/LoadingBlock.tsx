import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingBlockProps {
  /** Jumlah baris skeleton */
  rows?: number;
  className?: string;
}

/** Skeleton baris untuk area tabel/list yang sedang dimuat. */
export function LoadingBlock({ rows = 5, className }: LoadingBlockProps) {
  return (
    <div className={cn("space-y-2.5 p-4", className)} role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-9 w-full", i === 0 && "w-2/3")} />
      ))}
    </div>
  );
}

interface LoadingPageProps {
  label?: string;
}

/** Skeleton halaman penuh untuk layar yang sedang memuat data. */
export function LoadingPage({ label = "Memuat…" }: LoadingPageProps) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4" role="status" aria-label={label}>
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
