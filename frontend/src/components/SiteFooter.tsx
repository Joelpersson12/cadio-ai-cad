const legalLinks = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Contact", href: "/contact" },
];

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={
        compact
          ? "border-t border-cadio-border/30 pt-4 text-[10px] font-bold uppercase tracking-widest text-cadio-muted/60"
          : "border-t border-cadio-border/50 bg-cadio-bg px-6 py-12 text-center text-xs font-medium text-cadio-muted"
      }
    >
      <div className={compact ? "flex flex-col gap-3" : "mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row"}>
        <div className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-cadio-accent" />
          <span>&copy; 2026 Cadio Engineering</span>
        </div>
        <nav className={compact ? "flex flex-wrap gap-4" : "flex flex-wrap justify-center gap-8"}>
          {legalLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
          <a
            href="mailto:support@cadio.net?subject=Cadio%20Feedback"
            className="text-cadio-accent hover:text-cadio-accent-hover transition-colors"
          >
            Feedback
          </a>
        </nav>
      </div>
    </footer>
  );
}
