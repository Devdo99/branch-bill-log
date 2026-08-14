import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLS: Record<Tone, string> = {
  success: "bg-success-bg text-success border-success/25",
  warning: "bg-warning-bg text-warning border-warning/30",
  danger: "bg-destructive-bg text-destructive border-destructive/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

const ICONS: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertTriangle,
  neutral: Clock,
};

interface StatusBadgeProps {
  /** Status mentah dari database ("SUDAH" | "BELUM", dst.) */
  status: string;
  /** Label opsional; default "Lunas" / "Belum" */
  labels?: { done?: string; pending?: string };
  /** Tone eksplisit; default menurun dari status */
  tone?: Tone;
  className?: string;
}

export function StatusBadge({ status, labels, tone, className }: StatusBadgeProps) {
  const done = status === "SUDAH" || status.toLowerCase() === "lunas";
  const t = tone ?? (done ? "success" : "warning");
  const Icon = ICONS[t];
  const text = done ? (labels?.done ?? "Lunas") : (labels?.pending ?? "Belum");

  return (
    <span className={cn("status-pill inline-flex items-center gap-1.5 border text-xs", TONE_CLS[t], className)}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}
