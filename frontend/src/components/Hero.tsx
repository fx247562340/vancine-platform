"use client";

import { ArrowRight, Play } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-16">
      {/* Gradient Background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: "var(--gradient-hero)",
        }}
      />
      {/* Overlay pattern */}
      <div className="absolute inset-0 -z-10 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="max-w-[1200px] mx-auto px-6 text-center text-white">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-secondary-light animate-pulse" />
          Now available — Chinese AI models for global developers
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold leading-[1.1] mb-6 tracking-tight">
          One API,
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-secondary-light to-accent-yellow">
            Infinite Creativity
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed">
          Access flagship models from DeepSeek, Qwen, Doubao, Kimi, MiniMax and
          more — plus GPT, Claude, Gemini and Grok. One unified API.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://vancine.com/docs"
            className="group flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-primary bg-white rounded-xl hover:bg-white/90 transition-all hover:shadow-xl hover:shadow-white/20 hover:-translate-y-0.5"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="#features"
            className="flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 transition-all"
          >
            <Play className="w-4 h-4" />
            Learn More
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16 text-white/70">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">50+</div>
            <div className="text-sm mt-1">AI Models</div>
          </div>
          <div className="w-px h-10 bg-white/20 hidden md:block" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">3-10x</div>
            <div className="text-sm mt-1">Cheaper</div>
          </div>
          <div className="w-px h-10 bg-white/20 hidden md:block" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">1</div>
            <div className="text-sm mt-1">Unified API</div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
