import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type LegalPageKind = "terms" | "privacy" | "cookies" | "contact";

const pages: Record<
  LegalPageKind,
  {
    title: string;
    eyebrow: string;
    updated: string;
    icon: string;
    sections: Array<{ heading: string; body: string[] }>;
  }
> = {
  terms: {
    title: "Terms of Service",
    eyebrow: "Cadio legal",
    updated: "Effective June 22, 2026",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    sections: [
      {
        heading: "What Cadio Is",
        body: [
          "Cadio is an AI-assisted CAD and 3D-printing platform. It helps users generate printable model concepts, remix designs, and edit CAD-style geometry using natural language.",
          "Outputs should be treated as drafts that require review before use.",
        ],
      },
      {
        heading: "Account and Access",
        body: [
          "You must create an account to download files. By creating an account you confirm you are at least 13 years old and that the information you provide is accurate.",
          "You are responsible for maintaining the security of your account credentials. Cadio is not liable for losses caused by unauthorized account access.",
        ],
      },
      {
        heading: "Subscriptions and Billing",
        body: [
          "Cadio offers paid subscription plans (Pro and Unlimited) in addition to a Free tier. All prices are in USD and billed monthly.",
          "Free accounts include 3 total file downloads. Pro accounts include 20 downloads per calendar month. Unused monthly downloads do not roll over.",
          "Paid subscriptions renew automatically each month. You can cancel at any time from your account settings — cancellation takes effect at the end of the current billing period.",
          "All payments are processed by Stripe, Inc. Refunds are available within 7 days of a charge if no files have been downloaded during that billing period. Contact support@cadio.net to request a refund.",
          "Cadio reserves the right to change subscription prices with 30 days notice. Continued use after the notice period constitutes acceptance of the new price.",
        ],
      },
      {
        heading: "User Responsibility",
        body: [
          "You are responsible for verifying every generated or remixed model before printing or using it.",
          "Cadio does not guarantee that models are safe, structurally sound, dimensionally accurate, printable, or fit for any specific purpose.",
        ],
      },
      {
        heading: "Third-Party Sources",
        body: [
          "Cadio may use public model pages, examples, and source signals as inspiration. You must respect third-party licenses, attribution requirements, and usage restrictions when using inspiration or source models.",
          "Generated or remixed models should be checked carefully before commercial use.",
        ],
      },
      {
        heading: "No Liability",
        body: [
          "Cadio is not liable for failed prints, printer damage, material waste, unsafe use, injury, product defects, or losses caused by generated models or user modifications.",
          "Use Cadio outputs with care, especially for load-bearing, electrical, mechanical, automotive, medical, or safety-critical parts.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions about these terms can be sent to support@cadio.net."],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    eyebrow: "Cadio privacy",
    updated: "Effective June 22, 2026",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    sections: [
      {
        heading: "Data Cadio May Process",
        body: [
          "Cadio may process prompts, uploaded images, generated models, selected examples, saved model data, export choices, printer/material selections, and basic usage data.",
          "This data is used to provide the product, improve model generation, troubleshoot issues, and make Cadio more useful.",
        ],
      },
      {
        heading: "Account Data",
        body: [
          "When you create an account, Cadio stores your email address, a hashed (non-reversible) version of your password, your subscription plan, and your download usage count.",
          "Your email may be used to send transactional messages such as receipts and account notifications. Cadio does not send marketing emails without your consent.",
        ],
      },
      {
        heading: "Payment Processing",
        body: [
          "Payments are processed by Stripe, Inc. Cadio does not store your full card number, CVV, or other sensitive payment details — these are handled entirely by Stripe under their PCI-compliant infrastructure.",
          "Cadio may store your Stripe Customer ID and subscription ID to link your account to an active plan. Stripe's privacy policy applies to data processed on their platform.",
        ],
      },
      {
        heading: "Analytics",
        body: [
          "If analytics are enabled, Cadio may collect basic usage analytics such as page views and product interaction events.",
          "Analytics are optional in the codebase and are only activated when analytics environment variables are configured.",
        ],
      },
      {
        heading: "Third-Party Model Sources",
        body: [
          "When Cadio searches for public models or inspiration, it may request information from public model sites. Those services may have their own privacy practices.",
        ],
      },
      {
        heading: "Data Deletion",
        body: [
          "You may request deletion of your account and associated data at any time by emailing support@cadio.net. Deletion removes your email, hashed password, saved models, and session tokens.",
        ],
      },
      {
        heading: "Contact",
        body: ["For privacy questions, contact support@cadio.net."],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    eyebrow: "Cadio cookies",
    updated: "Effective June 8, 2026",
    icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
    sections: [
      {
        heading: "How Cadio Uses Cookies",
        body: [
          "Cadio uses essential browser storage and cookies to keep the workspace working, remember session state, support saved accounts, and preserve preferences such as language and project context.",
          "These essential items are required for core product functionality and are not used to sell personal information.",
        ],
      },
      {
        heading: "Analytics Cookies",
        body: [
          "Cadio may use analytics cookies or similar technologies only when analytics are configured for the site.",
          "Analytics help understand product usage, diagnose issues, and improve the experience. You can block non-essential cookies in your browser settings.",
        ],
      },
      {
        heading: "Third-Party Services",
        body: [
          "When Cadio connects to third-party model sources, hosting, analytics, or infrastructure providers, those services may set their own cookies or process technical request data under their own policies.",
        ],
      },
      {
        heading: "Contact",
        body: ["Questions about cookies can be sent to support@cadio.net."],
      },
    ],
  },
  contact: {
    title: "Contact Cadio",
    eyebrow: "Support and feedback",
    updated: "Cadio is currently in early development.",
    icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    sections: [
      {
        heading: "Get In Touch",
        body: [
          "For feedback, support, bug reports, or business inquiries, contact:",
          "support@cadio.net",
        ],
      },
      {
        heading: "Early Development",
        body: [
          "Cadio is currently in early development. Feedback about model quality, editing tools, mobile usability, and print settings is especially helpful.",
        ],
      },
    ],
  },
};

const navItems: Array<{ kind: LegalPageKind; label: string }> = [
  { kind: "terms", label: "Terms" },
  { kind: "privacy", label: "Privacy" },
  { kind: "cookies", label: "Cookies" },
  { kind: "contact", label: "Contact" },
];

export default function LegalPage({
  page,
  onStartBuilding,
  onNavigate,
}: {
  page: LegalPageKind;
  onStartBuilding: () => void;
  onNavigate?: (page: LegalPageKind) => void;
}) {
  const content = pages[page];

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <CadioLogo subtitle="" />
          </a>
          <button
            onClick={onStartBuilding}
            className="h-9 rounded-lg bg-[#00F0FF] px-4 text-sm font-semibold text-[#050505] hover:bg-[#00F0FF]/90 transition-colors"
          >
            Start Building
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:flex lg:gap-16">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">Legal</p>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.kind}
                  onClick={() => onNavigate?.(item.kind)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    page === item.kind
                      ? "border border-[#00F0FF]/20 bg-[#00F0FF]/10 text-[#00F0FF]"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={pages[item.kind].icon} />
                  </svg>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold text-white/60 mb-2">Need help?</p>
              <a
                href="mailto:support@cadio.net"
                className="text-xs text-[#00F0FF] hover:text-white transition-colors"
              >
                support@cadio.net
              </a>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#00F0FF]">{content.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">{content.title}</h1>
          <p className="mt-3 text-sm text-white/40">{content.updated}</p>

          {/* Mobile nav */}
          <div className="mt-6 flex flex-wrap gap-2 lg:hidden">
            {navItems.map((item) => (
              <button
                key={item.kind}
                onClick={() => onNavigate?.(item.kind)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  page === item.kind
                    ? "bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20"
                    : "bg-white/5 text-white/50 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-10 space-y-10">
            {content.sections.map((section) => (
              <section key={section.heading} className="border-t border-white/10 pt-8">
                <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-white/60">
                  {section.body.map((paragraph) =>
                    paragraph === "support@cadio.net" ? (
                      <p key={paragraph}>
                        <a className="font-semibold text-[#00F0FF] hover:text-white transition-colors" href="mailto:support@cadio.net">
                          support@cadio.net
                        </a>
                      </p>
                    ) : (
                      <p key={paragraph}>{paragraph}</p>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>

          {/* CTA block */}
          <div className="mt-16 rounded-2xl border border-[#00F0FF]/20 bg-[#00F0FF]/5 p-8 text-center">
            <p className="text-lg font-semibold text-white">Ready to get started?</p>
            <p className="mt-2 text-sm text-white/50">Start free with 3 downloads. Upgrade anytime.</p>
            <button
              onClick={onStartBuilding}
              className="mt-6 rounded-lg bg-[#00F0FF] px-8 py-3 text-sm font-semibold text-[#050505] hover:bg-[#00F0FF]/90 transition-colors"
            >
              Start Building
            </button>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
