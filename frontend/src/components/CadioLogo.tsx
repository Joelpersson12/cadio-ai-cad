type CadioLogoProps = {
  compact?: boolean;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
};

export function CadioMark({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color}
      width={size}
      height={size}
      aria-hidden="true"
    >
      {/* Precision caliper "C" — three bars forming the letter */}
      {/* Left vertical bar */}
      <rect x="2.5" y="2" width="3.5" height="20" rx="1.75" />
      {/* Top horizontal bar */}
      <rect x="2.5" y="2" width="15" height="3.5" rx="1.75" />
      {/* Bottom horizontal bar */}
      <rect x="2.5" y="18.5" width="15" height="3.5" rx="1.75" />
      {/* Tick marks at open end — suggest measurement / CAD */}
      <rect x="17" y="2" width="2" height="6.5" rx="1" opacity="0.35" />
      <rect x="17" y="15.5" width="2" height="6.5" rx="1" opacity="0.35" />
      {/* Center accent dot */}
      <circle cx="20.5" cy="12" r="1.5" opacity="0.5" />
    </svg>
  );
}

export default function CadioLogo({
  compact = false,
  subtitle,
  onClick,
  className = "",
}: CadioLogoProps) {
  const content = (
    <>
      <span className="shrink-0 text-cadio-accent">
        <CadioMark size={28} />
      </span>
      {!compact && (
        <div className="min-w-0 flex flex-col justify-center leading-none">
          <span className="block text-[15px] font-bold tracking-tight text-cadio-text">
            Cadio
          </span>
          {subtitle && (
            <span className="block text-[10px] font-medium tracking-widest text-cadio-muted/70 mt-0.5 uppercase">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 items-center gap-2.5 text-left transition-opacity hover:opacity-80 ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>{content}</div>;
}
