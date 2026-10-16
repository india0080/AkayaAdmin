import mark from "@/design/brand/akaya-mark.png";

/// The Akaya mark (akaya_ai/assets/images/akayalogo.png) rendered as a mask
/// so it takes `currentColor` — correct in both themes without a second asset.
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${mark.src})`,
        maskImage: `url(${mark.src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export function BrandLockup({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="ui-brand-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <BrandMark size={20} />
      </span>
      {!collapsed ? (
        <span className="leading-tight">
          <span className="ui-brand-name block text-sm font-bold tracking-tight text-fg">Akaya</span>
          <span className="block text-2xs font-medium uppercase tracking-[0.12em] text-fg-subtle">Console</span>
        </span>
      ) : null}
    </span>
  );
}
