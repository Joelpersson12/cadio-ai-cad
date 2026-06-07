type CadioLogoProps = {
  compact?: boolean;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
};

export default function CadioLogo({
  compact = false,
  subtitle = "AI CAD workspace",
  onClick,
  className = "",
}: CadioLogoProps) {
  const content = (
    <>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#28c7df] text-base font-black text-[#081013] shadow-[0_0_22px_rgba(40,199,223,0.22)]">
        <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),rgba(255,255,255,0)_48%)]" />
        <span className="absolute bottom-1.5 left-1.5 h-2.5 w-2.5 rounded-md bg-[#062630]/45" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-white/90" />
        <span className="relative">C</span>
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-sm font-black uppercase tracking-[0.24em] text-white">
            Cadio
          </span>
          {subtitle && (
            <span className="block text-[11px] leading-4 text-[#9a9a9d]">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 items-center gap-3 text-left ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`flex min-w-0 items-center gap-3 ${className}`}>{content}</div>;
}
