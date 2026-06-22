type CadioLogoProps = {
  compact?: boolean;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
};

/** Isometric cube — three visible faces, CAD-engineering mark */
export function CadioMark({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Right face — brightest (facing viewer) */}
      <path d="M22 8 L22 16 L12 22 L12 14 Z" fill={color} fillOpacity="0.55" />
      {/* Left face — in partial shadow */}
      <path d="M2 8 L12 14 L12 22 L2 16 Z" fill={color} fillOpacity="0.22" />
      {/* Top face — lit from above */}
      <path d="M12 2 L22 8 L12 14 L2 8 Z" fill={color} fillOpacity="0.85" />
      {/* All visible edges */}
      <path
        d="M12 2 L22 8 L12 14 L2 8 Z M22 8 L22 16 L12 22 L12 14 M2 8 L2 16 L12 22"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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
        <CadioMark size={26} />
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
