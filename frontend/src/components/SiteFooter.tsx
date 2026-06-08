const legalLinks = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/privacy#cookies" },
  { label: "Contact", href: "/contact" },
];

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={
        compact
          ? "border-t border-[#2d2d2f] pt-3 text-[10px] text-[#777]"
          : "border-t border-white/10 px-4 py-8 text-center text-xs text-[#8f8f92]"
      }
    >
      <div className={compact ? "flex flex-col gap-2" : "mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row"}>
        <span>&copy; 2026 Cadio</span>
        <nav className={compact ? "flex flex-wrap gap-3" : "flex flex-wrap justify-center gap-5"}>
          {legalLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </a>
          ))}
          <a
            href="mailto:support@cadio.net?subject=Cadio%20Feedback"
            className="hover:text-white"
          >
            Feedback
          </a>
        </nav>
      </div>
    </footer>
  );
}
