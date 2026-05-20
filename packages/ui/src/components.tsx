import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { CheckCircle2, Circle, Loader2, PauseCircle, XCircle } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cx("cp-button", `cp-button-${variant}`, className)} {...props} />;
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} className={cx("cp-icon-button", className)} {...props}>
      {children}
    </button>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cx("cp-panel", className)} {...props} />;
}

export function StatusDot({ status }: { status: "active" | "idle" | "degraded" | "error" }) {
  if (status === "active") {
    return <Loader2 className="cp-status-icon cp-status-active" aria-hidden="true" />;
  }
  if (status === "idle") {
    return <CheckCircle2 className="cp-status-icon cp-status-idle" aria-hidden="true" />;
  }
  if (status === "degraded") {
    return <PauseCircle className="cp-status-icon cp-status-degraded" aria-hidden="true" />;
  }
  return <XCircle className="cp-status-icon cp-status-error" aria-hidden="true" />;
}

export function EmptyCircle() {
  return <Circle className="cp-status-icon" aria-hidden="true" />;
}
