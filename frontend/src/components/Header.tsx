"use client";

import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "https://api.vancine.com" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-surface/80 border-b border-border">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
          <Zap className="w-6 h-6" />
          Vancine
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-text-secondary hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://api.vancine.com"
            className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-primary hover:bg-primary-dark transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            Get Started
          </a>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-text-secondary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-surface/95 backdrop-blur-lg">
          <nav className="flex flex-col p-4 gap-3">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="https://api.vancine.com"
              className="mt-2 px-5 py-2.5 text-sm font-semibold text-white text-center rounded-xl bg-primary hover:bg-primary-dark transition-all"
            >
              Get Started
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
