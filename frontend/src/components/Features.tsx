"use client";

import { Video, Image, Brain, Music } from "lucide-react";

const features = [
  {
    icon: Video,
    color: "bg-accent-pink/10 text-accent-pink",
    title: "Video Generation",
    description:
      "Generate stunning videos from text or images. Powered by Wan 2.2, Kling, and other cutting-edge models.",
    models: "Wan 2.2 · Kling · Hailuo",
  },
  {
    icon: Image,
    color: "bg-primary/10 text-primary",
    title: "Image Generation",
    description:
      "Create high-quality images with FLUX, Qwen-Image, Seedream, and more. From photorealistic to artistic styles.",
    models: "FLUX · Qwen-Image · Seedream",
  },
  {
    icon: Brain,
    color: "bg-secondary/10 text-secondary",
    title: "LLM API",
    description:
      "Access the most powerful Chinese LLMs through a single OpenAI-compatible endpoint. DeepSeek, Qwen, GLM, and more.",
    models: "DeepSeek V4 · Qwen 3.6 · GLM 5.1",
  },
  {
    icon: Music,
    color: "bg-accent-yellow/10 text-accent-yellow",
    title: "Music Generation",
    description:
      "Compose music from text descriptions. Full songs with vocals, instruments, and professional mixing.",
    models: "Suno · Udio",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block px-3 py-1 mb-4 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full">
            Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
            Everything you need in one API
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            No more juggling multiple providers. Access the best Chinese AI
            models through a single, unified interface.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative p-8 rounded-2xl bg-surface border border-border hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
            >
              <div
                className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5 ${feature.color}`}
              >
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-3">
                {feature.title}
              </h3>
              <p className="text-text-secondary leading-relaxed mb-4">
                {feature.description}
              </p>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {feature.models}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
