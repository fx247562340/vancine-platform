import { Zap } from "lucide-react";

const links = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "API Docs", href: "https://vancine.com/docs" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
};

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" className="flex items-center gap-2 font-bold text-xl text-primary mb-4">
              <Zap className="w-6 h-6" />
              Vancine
            </a>
            <p className="text-sm text-text-secondary leading-relaxed">
              One API, Infinite Creativity. The best Chinese AI models, accessible globally.
            </p>
          </div>

          {/* Link Columns */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">
                {category}
              </h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm text-text-secondary hover:text-primary transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-text-muted">
            © {year} Vancine. All rights reserved.
          </p>
          <p className="text-sm text-text-muted">
            Designed & Developed by{" "}
            <a
              href="https://github.com/fx247562340/vancine-platform"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Vancine
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
