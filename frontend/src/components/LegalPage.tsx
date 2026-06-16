import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type LegalPageKind = "terms" | "privacy" | "cookies" | "contact";

const pages: Record<
  LegalPageKind,
  {
    title: string;
    eyebrow: string;
    updated: string;
    sections: Array<{ heading: string; body: string[] }>;
  }
> = {
  terms: {
    title: "Terms of Service",
    eyebrow: "Cadio legal",
    updated: "Effective June 7, 2026",
    sections: [
      {
        heading: "What Cadio Is",
        body: [
          "Cadio is an AI-assisted CAD and 3D-printing tool. It helps users search for inspiration, generate printable model concepts, remix designs, and edit CAD-style geometry.",
          "The product is currently in early development, so outputs should be treated as drafts that require review.",
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
    updated: "Effective June 7, 2026",
    sections: [
      {
        heading: "Data Cadio May Process",
        body: [
          "Cadio may process prompts, uploaded images, generated models, selected examples, saved model data, export choices, printer/material selections, and basic usage data.",
          "This data is used to provide the product, improve model generation, troubleshoot issues, and make Cadio more useful.",
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
        heading: "Contact",
        body: ["For privacy questions, contact support@cadio.net."],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    eyebrow: "Cadio cookies",
    updated: "Effective June 8, 2026",
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

export default function LegalPage({
  page,
  onStartBuilding,
}: {
  page: LegalPageKind;
  onStartBuilding: () => void;
}) {
  const content = pages[page];

  return (
    <div className="h-full overflow-y-auto bg-[#151515] text-white">
      <header className="border-b border-white/10 bg-[#151515]/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <CadioLogo subtitle="" />
          </a>
          <button
            onClick={onStartBuilding}
            className="h-9 rounded-lg bg-[#e8e8e8] px-4 text-sm font-semibold text-[#151515] hover:bg-white"
          >
            Start building
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2bb8dc]">{content.eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal text-white sm:text-5xl">{content.title}</h1>
        <p className="mt-3 text-sm text-[#a9a9ac]">{content.updated}</p>

        <div className="mt-10 space-y-8">
          {content.sections.map((section) => (
            <section key={section.heading} className="border-t border-white/10 pt-6">
              <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[#c8c8cb]">
                {section.body.map((paragraph) =>
                  paragraph === "support@cadio.net" ? (
                    <p key={paragraph}>
                      <a className="font-semibold text-[#7ddff2] hover:text-white" href="mailto:support@cadio.net">
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
      </main>

      <SiteFooter />
    </div>
  );
}
