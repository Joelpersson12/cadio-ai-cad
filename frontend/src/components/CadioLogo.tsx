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
      <div className="relative h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-cadio-accent/20 bg-cadio-surface shadow-sm">
        {/* Geometric "C" inspired by wireframe/CAD */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-cadio-accent"
        >
          <path d="M16 8a4.5 4.5 0 0 0-7.07 1.14l-1.42 2.85A4.5 4.5 0 0 0 9 18h4" />
          <path d="M16 8V6a2 2 0 0 0-2-2h-4" />
        </svg>
        <div className="absolute inset-0 rounded-md bg-gradient-to-tr from-cadio-accent/5 to-transparent pointer-events-none" />
      </div>
      {!compact && (
        <div className="min-w-0 flex flex-col justify-center">
          <span className="block text-base font-bold tracking-tight text-cadio-text leading-none">
            Cadio
          </span>
          {subtitle && (
            <span className="block text-[10px] font-medium tracking-wide text-cadio-muted mt-1 uppercase">
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
        className={`flex min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-80 ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`flex min-w-0 items-center gap-3 ${className}`}>{content}</div>;
}
