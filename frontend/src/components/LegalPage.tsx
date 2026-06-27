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
    updated: "Effective June 27, 2026",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    sections: [
      {
        heading: "Company Information",
        body: [
          "Cadio is operated as a sole trader (enskild firma) under the trade name Cadio Engineering, Sweden. Contact: support@cadio.net.",
          "These Terms of Service constitute a binding agreement between you and the operator of Cadio when you use cadio.net or any associated services.",
        ],
      },
      {
        heading: "What Cadio Is",
        body: [
          "Cadio is an AI-assisted CAD and 3D-printing platform. It helps users generate printable model concepts, remix designs, and edit CAD-style geometry using natural language.",
          "Outputs should be treated as drafts that require review before use. Cadio is currently in early access beta.",
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
          "Free accounts include 3 total file downloads. Pro accounts include 20 downloads per calendar month. Unlimited accounts have no download limit. Unused monthly downloads do not roll over.",
          "Paid subscriptions renew automatically each month on the same date the subscription started. You will receive access to the plan immediately upon payment.",
          "You can cancel your subscription at any time by contacting support@cadio.net or through your account settings. Cancellation takes effect at the end of the current billing period — you retain access until then. No partial refunds are issued for the remaining period.",
          "All payments are processed by Stripe, Inc. Cadio does not store your card details. Stripe's terms and privacy policy apply to payment processing.",
          "Cadio reserves the right to change subscription prices with 30 days' written notice by email. Continued use after the notice period constitutes acceptance of the new price.",
        ],
      },
      {
        heading: "Right of Withdrawal — Digital Services",
        body: [
          "Under the EU Consumer Rights Directive and Swedish Distansavtalslag (2005:59), consumers normally have a 14-day right to withdraw from contracts made at a distance without giving a reason.",
          "However, by completing checkout and starting your Cadio subscription, you expressly request that the digital service begins immediately. You acknowledge and agree that by doing so you waive your right of withdrawal once the service has commenced, in accordance with Article 16(m) of Directive 2011/83/EU.",
          "If you have not yet used the service (no downloads, no sessions) within 14 days of purchase, you may still request a full refund by contacting support@cadio.net. We will honor refund requests on a case-by-case basis at our discretion.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Refunds are available within 7 days of a charge if no files have been downloaded and no substantial use of the platform has occurred during that billing period. Contact support@cadio.net to request a refund.",
          "After 7 days, or if the service has been used, refunds are at Cadio's discretion.",
          "Chargebacks initiated without first contacting Cadio support may result in account suspension.",
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
        heading: "Third-Party Models, Licenses and Attribution",
        body: [
          "Cadio can search public 3D-printing platforms (such as Printables, Thingiverse and MakerWorld) and import publicly available model files as a starting point. Cadio does not own these models — they remain the property of their original creators and are made available under the license each creator chose.",
          "Whenever Cadio imports or references an external model, it displays the source, the creator, and the detected license through the information (i) button. You are responsible for reading and complying with that license, including any attribution, non-commercial, share-alike, or no-derivatives terms.",
          "Cadio automatically detects when a model's license forbids modification (for example Creative Commons BY-ND, BY-NC-ND, or All Rights Reserved) and will not let its AI editor create a derivative of that model. When a license cannot be confirmed automatically, Cadio marks it as unverified — you must check the original source page before editing, redistributing, or using the model commercially.",
          "License detection is provided for convenience only and may be incomplete or inaccurate. It is not legal advice. The license shown on the original model page always governs. If you are unsure of your rights, do not modify, redistribute, or sell the model.",
          "You agree not to use Cadio to remove attribution, circumvent license restrictions, or otherwise infringe the intellectual property rights of any creator. You are solely responsible for how you use, modify, print, share, or sell any model, and you agree to indemnify Cadio against any claim arising from your use of third-party models.",
        ],
      },
      {
        heading: "Copyright, Reporting and Takedowns",
        body: [
          "Cadio respects intellectual property rights and expects its users to do the same. If you are a rights holder and believe that a model accessible through Cadio infringes your copyright, or that the displayed license or attribution is incorrect, contact support@cadio.net with a description of the work, the URL or model in question, and your contact details.",
          "On receipt of a valid report, Cadio will review and, where appropriate, promptly remove or block access to the relevant model and correct license information. Cadio may also remove access to any model at its discretion.",
          "Cadio acts as an intermediary that surfaces publicly available content and does not host the original model files of third-party platforms. Claims relating to a model's content or licensing may also need to be directed to the platform that hosts it.",
        ],
      },
      {
        heading: "No Liability",
        body: [
          "Cadio is not liable for failed prints, printer damage, material waste, unsafe use, injury, product defects, or losses caused by generated models or user modifications.",
          "Use Cadio outputs with care, especially for load-bearing, electrical, mechanical, automotive, medical, or safety-critical parts.",
          "To the extent permitted by law, Cadio's total liability to you for any claim is limited to the amount you paid to Cadio in the 3 months preceding the claim.",
        ],
      },
      {
        heading: "Governing Law and Dispute Resolution",
        body: [
          "These terms are governed by Swedish law. Any disputes that cannot be resolved amicably shall be submitted to the Swedish general courts (allmän domstol) as the court of first instance.",
          "If you are a consumer in the EU, you may also refer a dispute to the Swedish National Board for Consumer Disputes (Allmänna Reklamationsnämnden, ARN) at www.arn.se, or use the EU Online Dispute Resolution platform at ec.europa.eu/consumers/odr.",
          "Cadio commits to participating in ARN proceedings and to follow ARN's recommendations.",
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
    updated: "Effective June 27, 2026",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    sections: [
      {
        heading: "Data Controller",
        body: [
          "The data controller for personal data processed through cadio.net is the sole trader operating under the trade name Cadio Engineering, Sweden. Contact: support@cadio.net.",
          "This policy describes how we collect, use, and protect your personal data in accordance with the EU General Data Protection Regulation (GDPR) and the Swedish Data Protection Act (2018:218).",
        ],
      },
      {
        heading: "Data Cadio Processes",
        body: [
          "Cadio may process prompts, uploaded images, generated models, selected examples, saved model data, export choices, printer/material selections, and basic usage data.",
          "This data is used to provide the product, improve model generation, troubleshoot issues, and make Cadio more useful. Legal basis: contract performance and legitimate interest.",
        ],
      },
      {
        heading: "Account Data",
        body: [
          "When you create an account, Cadio stores your email address, a hashed (non-reversible) version of your password, your subscription plan, and your download usage count.",
          "Your email may be used to send transactional messages such as receipts and account notifications. Cadio does not send marketing emails without your explicit consent. Legal basis: contract performance and legitimate interest.",
          "Account data is retained for as long as your account is active, plus a maximum of 2 years after deletion for legal compliance purposes.",
        ],
      },
      {
        heading: "Payment Processing",
        body: [
          "Payments are processed by Stripe, Inc. (USA). Cadio does not store your full card number, CVV, or other sensitive payment details — these are handled entirely by Stripe under their PCI-compliant infrastructure.",
          "Cadio may store your Stripe Customer ID and subscription ID to link your account to an active plan. Stripe acts as a data processor under our agreement with them. Stripe's privacy policy applies to data processed on their platform.",
          "Transfer of data to Stripe (USA) is covered by Standard Contractual Clauses.",
        ],
      },
      {
        heading: "Analytics",
        body: [
          "If analytics are enabled, Cadio may collect basic usage analytics such as page views and product interaction events. Legal basis: legitimate interest.",
          "Analytics are optional in the codebase and are only activated when analytics environment variables are configured. No data is sold to third parties.",
        ],
      },
      {
        heading: "Third-Party Model Sources",
        body: [
          "When Cadio searches for public models, it requests information from public model platforms (such as Printables, Thingiverse and MakerWorld). Those services may have their own privacy practices and may receive your search terms and basic technical request data.",
          "Cadio stores the source, creator, and license information of imported models so it can display attribution and license terms to you. This is metadata about public models, not your personal data.",
        ],
      },
      {
        heading: "Your Rights Under GDPR",
        body: [
          "You have the right to: access your personal data (Art. 15), correct inaccurate data (Art. 16), delete your data (Art. 17), restrict processing (Art. 18), data portability (Art. 20), and object to processing (Art. 21).",
          "To exercise any of these rights, email support@cadio.net. We will respond within 30 days.",
          "You also have the right to lodge a complaint with the Swedish Data Protection Authority (Integritetsskyddsmyndigheten, IMY) at imy.se.",
        ],
      },
      {
        heading: "Data Deletion",
        body: [
          "You may request deletion of your account and associated data at any time by emailing support@cadio.net. Deletion removes your email, hashed password, saved models, and session tokens within 30 days.",
          "Some data may be retained longer if required by law (e.g. accounting records for 7 years under Swedish Bokföringslag).",
        ],
      },
      {
        heading: "Contact",
        body: ["For privacy questions or to exercise your rights, contact support@cadio.net."],
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
