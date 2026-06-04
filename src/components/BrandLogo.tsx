import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  subtitle?: string;
  showText?: boolean;
}

export default function BrandLogo({
  className,
  markClassName,
  textClassName,
  subtitle,
  showText = true,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <img
        src="/brand-mark.svg"
        alt=""
        className={cn("h-9 w-9 shrink-0 rounded-md", markClassName)}
        aria-hidden="true"
      />
      {showText && (
        <span className={cn("min-w-0", textClassName)}>
          <span className="block truncate font-semibold leading-5">NotaKu</span>
          {subtitle && <span className="block truncate text-xs font-normal opacity-70">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
