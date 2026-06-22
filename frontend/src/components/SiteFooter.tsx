const legalLinks = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Contact", href: "/contact" },
];

const productLinks = [
  { label: "Builder", href: "/app" },
  { label: "Examples", href: "/#workflow" },
  { label: "Pricing", href: "/#pricing" },
];

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="border-t border-cadio-border/30 pt-4 text-[10px] font-bold uppercase tracking-widest text-cadio-muted/60">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-cadio-accent" />
            <span>&copy; 2026 Cadio Engineering</span>
          </div>
          <nav className="flex flex-wrap gap-4">
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

  return (
    <footer className="border-t border-white/10 bg-[#050505] px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg font-bold tracking-tight text-white">Cadio</span>
              <span className="rounded-full bg-[#2bb8dc]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#2bb8dc]">
                Beta
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              AI-assisted CAD for makers, engineers, and curious builders.
            </p>
            <div className="mt-4 flex gap-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              <span className="rounded border border-white/10 px-2 py-1">STL</span>
              <span className="rounded border border-white/10 px-2 py-1">3MF</span>
              <span className="rounded border border-white/10 px-2 py-1">STEP</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/40">Product</p>
            <nav className="flex flex-col gap-3">
              {productLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-sm text-white/60 hover:text-white transition-colors">
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/40">Legal</p>
            <nav className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-sm text-white/60 hover:text-white transition-colors">
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-white/40">Contact</p>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:support@cadio.net"
                className="text-sm text-white/60 hover:text-[#2bb8dc] transition-colors"
              >
                support@cadio.net
              </a>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#2bb8dc]/10 px-3 py-1 text-[11px] font-semibold text-[#2bb8dc]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2bb8dc] animate-pulse" />
                Early Access Open
              </span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/30">&copy; 2026 Cadio Engineering. All rights reserved.</p>
          <p className="text-xs text-white/20">Precision tools for the next generation of makers.</p>
        </div>
      </div>
    </footer>
  );
}
