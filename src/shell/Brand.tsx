import bubble from "@/design/brand/akaya-bubble.png";

/// The Akaya pearl bubble, full colour, identical in every theme (the
/// brand asset is never tinted).
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimiser
    <img src={bubble.src} width={size} height={size} alt="" aria-hidden className={className} draggable={false} />
  );
}

export function BrandLockup({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={32} className="shrink-0 rounded-full" />
      {!collapsed ? (
        <span className="leading-tight">
          <span className="ui-brand-name block text-sm font-bold tracking-tight text-fg">Akaya</span>
          <span className="block text-2xs font-medium uppercase tracking-[0.12em] text-fg-subtle">Admin Console</span>
        </span>
      ) : null}
    </span>
  );
}
