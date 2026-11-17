import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Btn({
  tone = "ghost",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ghost" | "primary" | "danger" | "ok" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:opacity-40",
        tone === "primary" && "bg-stage-accent text-stage-fg",
        tone === "ghost" && "border border-stage-line bg-stage-surface text-stage-fg",
        tone === "danger" && "border border-stage-accent text-stage-accent",
        tone === "ok" && "bg-stage-ok text-stage-bg",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-stage-muted">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-stage-line bg-stage-bg px-3 text-stage-fg outline-none focus:border-stage-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Area({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-lg border border-stage-line bg-stage-bg px-3 py-2 text-stage-fg outline-none focus:border-stage-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stage-bg/80 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="grid w-full max-w-lg gap-4 rounded-2xl border border-stage-line bg-stage-panel p-4 shadow-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Btn className="min-h-11 min-w-11 px-0" onClick={onClose} aria-label="Fechar">
            ×
          </Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-stage-line bg-stage-panel p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-md text-stage-muted">{body}</p>
      {action}
    </div>
  );
}

export function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-stage-line bg-stage-panel px-3 py-3">
      <p className="text-xs tracking-widest text-stage-muted uppercase">{label}</p>
      <p className="mt-1 truncate font-mono text-lg text-stage-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stage-muted">{hint}</p> : null}
    </div>
  );
}
