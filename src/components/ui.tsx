import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";
import { useBackClose, useScrollLock } from "@/lib/hooks";

/* ---------------- Buttons ---------------- */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  variant?: "plain" | "fill" | "tinted";
}
export function IconButton({ icon, label, size = 24, active, variant = "plain", className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "tap-scale inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
        variant === "plain" && (active ? "text-primary" : "text-on-surface"),
        variant === "fill" && "bg-surface-3 text-on-surface",
        variant === "tinted" && (active ? "bg-primary/20 text-primary" : "bg-surface-3 text-on-surface"),
        "disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  variant?: "filled" | "tinted" | "gray" | "plain" | "white";
  size?: "sm" | "md" | "lg";
  full?: boolean;
}
export function Button({ icon, variant = "filled", size = "md", full, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "tap-scale inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold",
        size === "sm" && "h-9 px-4 text-[14px]",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-[52px] px-7 text-[17px]",
        full && "w-full",
        variant === "filled" && "bg-primary text-white",
        variant === "white" && "bg-white text-black",
        variant === "tinted" && "bg-primary/16 text-primary",
        variant === "gray" && "bg-surface-3 text-on-surface",
        variant === "plain" && "px-2 text-primary",
        "disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "lg" ? 22 : 19} className="-ml-0.5" />}
      {children}
    </button>
  );
}

/* ---------------- Segmented control (iOS) ---------------- */
export function Segmented<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; className?: string }) {
  const idx = Math.max(0, items.findIndex((i) => i.value === value));
  return (
    <div className={cn("relative flex h-8 w-full rounded-[9px] bg-white/[0.12] p-[2px]", className)} role="tablist">
      <div
        className="absolute inset-y-[2px] rounded-[7px] bg-surface-5 shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-transform duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(calc(${idx} * 100%))`, left: 2 }}
      />
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          role="tab"
          aria-selected={i.value === value}
          onClick={() => onChange(i.value)}
          className={cn("relative z-10 flex-1 truncate rounded-[7px] px-2 text-[13px] font-semibold transition-colors", i.value === value ? "text-white" : "text-on-surface-variant")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Chips (pills) ---------------- */
export function Chip({ children, active, icon, onClick, className }: { children: ReactNode; active?: boolean; icon?: IconName; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-scale inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-medium",
        active ? "bg-white text-black" : "bg-surface-2 text-on-surface",
        className,
      )}
    >
      {icon && <Icon name={icon} size={17} className="-ml-1" />}
      {children}
    </button>
  );
}

/** Compact theme marker: OP1 / ED2 / IN */
export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "OP" | "ED" | "IN" | "neutral" | "warn"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-[1px] text-[10.5px] font-bold uppercase leading-[15px] tracking-[0.02em]",
        tone === "OP" && "bg-primary/18 text-primary",
        tone === "ED" && "bg-secondary/18 text-secondary",
        tone === "IN" && "bg-tertiary/18 text-tertiary",
        tone === "neutral" && "bg-white/10 text-on-surface-variant",
        tone === "warn" && "bg-error/18 text-error",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Cover ---------------- */
export function Cover({
  src,
  fallback,
  alt = "",
  className,
  iconSize = 28,
  rounded = "rounded-xl",
  eager,
  priority,
}: {
  src: string | null | undefined;
  fallback?: string | null;
  alt?: string;
  className?: string;
  iconSize?: number;
  rounded?: string;
  eager?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const prev = useRef(src);
  if (prev.current !== src) {
    prev.current = src;
    if (failed) setFailed(false);
    if (useFallback) setUseFallback(false);
    if (loaded) setLoaded(false);
  }
  const effective = useFallback ? fallback : src;
  const showFallback = !effective || failed;
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", rounded, className)}>
      {!showFallback && (
        <img
          key={effective as string}
          src={effective as string}
          alt={alt}
          loading={eager || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (!useFallback && fallback && fallback !== src) setUseFallback(true);
            else setFailed(true);
          }}
          onLoad={() => setLoaded(true)}
          className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {(showFallback || !loaded) && (
        <div className={cn("absolute inset-0 flex items-center justify-center text-on-surface-dim", showFallback ? "bg-surface-2" : "skeleton")}>{showFallback && <Icon name="music_note" size={iconSize} />}</div>
      )}
    </div>
  );
}

/* ---------------- Playing indicator ---------------- */
export function PlayingBars({ paused, className, color = "bg-white" }: { paused?: boolean; className?: string; color?: string }) {
  return (
    <span className={cn("inline-flex h-[15px] items-end gap-[2.5px]", className)} aria-label={paused ? "На паузе" : "Играет"}>
      {["animate-bar-1", "animate-bar-2", "animate-bar-3", "animate-bar-4", "animate-bar-5"].map((a, i) => (
        <span key={i} className={cn("w-[2.5px] origin-bottom rounded-full", color, a)} style={{ height: "100%", animationPlayState: paused ? "paused" : "running", transform: paused ? "scaleY(0.3)" : undefined }} />
      ))}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#ff5f57] animate-live" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5f57]" />
      </span>
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-white">live</span>
    </span>
  );
}

/* ---------------- Section header ---------------- */
export function SectionHeader({ title, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 px-4 md:px-6">
      <h2 className="truncate text-[20px] font-bold tracking-[-0.02em] text-on-surface">{title}</h2>
      {action && onAction && (
        <button type="button" onClick={onAction} className="tap shrink-0 text-[15px] font-medium text-primary">
          {action}
        </button>
      )}
    </div>
  );
}

/* ---------------- Inset grouped list ---------------- */
export function ListGroup({ children, header, footer, className }: { children: ReactNode; header?: string; footer?: string; className?: string }) {
  return (
    <div className={cn("px-4 md:px-6", className)}>
      {header && <p className="px-1 pb-1.5 pt-1 text-[13px] font-medium text-on-surface-variant">{header}</p>}
      <div className="overflow-hidden rounded-[16px] bg-surface-2">{children}</div>
      {footer && <p className="px-1 pt-1.5 text-[12.5px] leading-snug text-on-surface-dim">{footer}</p>}
    </div>
  );
}

export function ListRow({
  icon,
  label,
  sub,
  value,
  onClick,
  danger,
  chevron,
  trailing,
  first,
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  sub?: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
  trailing?: ReactNode;
  first?: boolean;
}) {
  const Tag2 = onClick ? "button" : "div";
  return (
    <Tag2
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("row-tap flex w-full items-center gap-3.5 px-4 py-3 text-left", !first && "border-t border-white/[0.06]", onClick && "cursor-pointer")}
    >
      {icon && (
        <span className={cn("flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px]", danger ? "bg-error/15" : "bg-white/[0.08]")}>
          <Icon name={icon} size={16} className={danger ? "text-error" : "text-on-surface"} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15.5px]", danger ? "text-error" : "text-on-surface")}>{label}</span>
        {sub && <span className="mt-0.5 block text-[12.5px] text-on-surface-variant">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value && <span className="text-[14.5px] text-on-surface-variant">{value}</span>}
        {trailing}
        {chevron && <Icon name="chevron_right" size={16} className="text-on-surface-dim" />}
      </span>
    </Tag2>
  );
}

/** Legacy alias used by sheets */
export function MenuItem({ icon, label, sub, onClick, danger, trailing }: { icon: IconName; label: string; sub?: string; onClick?: () => void; danger?: boolean; trailing?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("row-tap flex w-full items-center gap-3.5 px-5 py-3 text-left", danger ? "text-error" : "text-on-surface")}>
      <Icon name={icon} size={21} className={cn("shrink-0", danger ? "text-error" : "text-on-surface-variant")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px]">{label}</span>
        {sub && <span className="block truncate text-[13px] text-on-surface-variant">{sub}</span>}
      </span>
      {trailing}
    </button>
  );
}

/* ---------------- Switch (iOS) ---------------- */
export function Switch({ checked, onChange, label, sub, icon, first }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string; icon?: IconName; iconColor?: string; first?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("row-tap flex w-full items-center gap-3.5 px-4 py-3 text-left", !first && "border-t border-white/[0.06]")}
    >
      {icon && (
        <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-white/[0.08]">
          <Icon name={icon} size={16} className="text-on-surface" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] text-on-surface">{label}</span>
        {sub && <span className="mt-0.5 block text-[12.5px] leading-snug text-on-surface-variant">{sub}</span>}
      </span>
      <span className={cn("relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-white" : "bg-white/20")}>
        <span
          className={cn(
            "absolute top-[3px] h-[22px] w-[22px] rounded-full transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            checked ? "translate-x-[21px] bg-black" : "translate-x-[3px] bg-white",
          )}
        />
      </span>
    </button>
  );
}

/* ---------------- Progress ---------------- */
export function ProgressBar({ value, indeterminate, className, color = "bg-primary" }: { value?: number; indeterminate?: boolean; className?: string; color?: string }) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-white/12", className)} role="progressbar" aria-valuenow={indeterminate ? undefined : Math.round(value ?? 0)}>
      {indeterminate ? <div className={cn("h-full w-1/3 rounded-full animate-indeterminate", color)} /> : <div className={cn("h-full rounded-full transition-[width] duration-200", color)} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />}
    </div>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <span className={cn("inline-block animate-spin rounded-full border-2 border-white/25 border-t-white", className)} style={{ width: size, height: size }} />;
}

/* ---------------- Skeletons ---------------- */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton rounded-xl", className)} style={style} />;
}

export function TrackRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2 md:px-6">
          <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardRowSkeleton({ count = 5, aspect = "aspect-[2/3]", width = "w-[128px]" }: { count?: number; aspect?: string; width?: string }) {
  return (
    <div className="flex gap-3 overflow-hidden px-4 md:px-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("shrink-0", width)}>
          <Skeleton className={cn("w-full rounded-xl", aspect)} />
          <Skeleton className="mt-2 h-3 w-3/4 rounded-md" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- States ---------------- */
export function EmptyState({ icon = "music_note", title, text, action, onAction }: { icon?: IconName; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center animate-fade-in">
      <Icon name={icon} size={44} className="mb-4 text-on-surface-dim" />
      <h3 className="text-[19px] font-bold text-on-surface">{title}</h3>
      {text && <p className="mt-1.5 max-w-[280px] text-[14px] leading-snug text-on-surface-variant">{text}</p>}
      {action && onAction && (
        <Button variant="tinted" className="mt-5" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center animate-fade-in">
      <Icon name="wifi_off" size={44} className="mb-4 text-on-surface-dim" />
      <h3 className="text-[19px] font-bold text-on-surface">Нет соединения</h3>
      <p className="mt-1.5 max-w-[280px] text-[14px] leading-snug text-on-surface-variant">{message || "Проверьте подключение и попробуйте снова."}</p>
      {onRetry && (
        <Button variant="tinted" className="mt-5" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/* ---------------- Sheet (iOS) ---------------- */
export function BottomSheet({ open, onClose, title, children, tag, maxHeight = "max-h-[88dvh]" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tag: string; maxHeight?: string }) {
  useScrollLock(open);
  useBackClose(open, onClose, tag);
  const [render, setRender] = useState(open);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setRender(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);

  if (!render) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <div className={cn("absolute inset-0 bg-black/60 transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <div
        ref={sheetRef}
        className={cn(
          "relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-[14px] bg-surface-2 transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] md:rounded-[16px]",
          maxHeight,
          visible ? "translate-y-0" : "translate-y-full md:translate-y-6 md:opacity-0",
        )}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        onTouchStart={(e) => {
          const scroller = sheetRef.current?.querySelector("[data-sheet-scroll]") as HTMLElement | null;
          if (scroller && scroller.scrollTop > 0) return;
          startY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (startY.current == null) return;
          const dy = e.touches[0].clientY - startY.current;
          if (dy > 0) setDragY(dy);
        }}
        onTouchEnd={() => {
          if (dragY > 90) onClose();
          setDragY(0);
          startY.current = null;
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-[5px] w-9 rounded-full bg-white/25" />
        </div>
        {title && <div className="px-5 pb-2 pt-1 text-[17px] font-bold text-on-surface">{title}</div>}
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain safe-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Horizontal scroller ---------------- */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:px-6", className)} style={{ scrollPaddingLeft: 16 }}>
      {children}
    </div>
  );
}
