/*
Copyright (C) 2023-2026 QuantumNous
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

const modelTypes = [
  {
    icon: '💬',
    title: 'LLM Models',
    titleZh: '大语言模型',
    models: 'DeepSeek V4 Pro · Qwen 3 · GLM-5 · Doubao Pro · Kimi K2.5 · Hunyuan Pro',
    desc: 'Top Chinese LLMs via unified OpenAI protocol',
    descZh: '中国最强 LLM，统一 OpenAI 协议接入',
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-500/10 dark:bg-blue-400/10',
    border: 'border-blue-500/20 dark:border-blue-400/20',
  },
  {
    icon: '🎨',
    title: 'Image Generation',
    titleZh: '图片生成',
    models: 'Seedream 4.0 · Qwen Image · FLUX 1.1 Pro · GPT Image · Jimeng · Imagen 4',
    desc: 'Text-to-image and image editing',
    descZh: '文生图、图生图、图片编辑',
    color: 'text-pink-500 dark:text-pink-400',
    bg: 'bg-pink-500/10 dark:bg-pink-400/10',
    border: 'border-pink-500/20 dark:border-pink-400/20',
  },
  {
    icon: '🎬',
    title: 'Video Generation',
    titleZh: '视频生成',
    models: 'Seedance 2.0 · Hailuo 2.3 · Kling V2 · Wan 2.5 · Vidu 2.0 · Veo 3.1',
    desc: 'Text-to-video and image-to-video',
    descZh: '文生视频、图生视频',
    color: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-orange-500/10 dark:bg-orange-400/10',
    border: 'border-orange-500/20 dark:border-orange-400/20',
  },
  {
    icon: '📦',
    title: '3D Generation',
    titleZh: '3D 生成',
    models: 'Seed3D 2.0 · Hyper3D Gen2 · Hitem3D 2.0',
    desc: 'Text/image to 3D model generation',
    descZh: '文本/图片转 3D 模型',
    color: 'text-purple-500 dark:text-purple-400',
    bg: 'bg-purple-500/10 dark:bg-purple-400/10',
    border: 'border-purple-500/20 dark:border-purple-400/20',
  },
  {
    icon: '🎵',
    title: 'Audio & Music',
    titleZh: '音频 & 音乐',
    models: 'Suno · MiniMax Speech 2.5 · CosyVoice · Fish Audio · GPT Audio',
    desc: 'Music generation, TTS, voice cloning',
    descZh: '音乐生成、语音合成、声音克隆',
    color: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    border: 'border-emerald-500/20 dark:border-emerald-400/20',
  },
  {
    icon: '🌐',
    title: 'Global Models',
    titleZh: '国际模型',
    models: 'GPT-5.4 · Claude Opus 4.7 · Gemini 3.1 · Grok 4 · o3-pro',
    desc: 'Also supports major global models, one API for all',
    descZh: '同时支持主流国际模型，一个 API 全覆盖',
    color: 'text-indigo-500 dark:text-indigo-400',
    bg: 'bg-indigo-500/10 dark:bg-indigo-400/10',
    border: 'border-indigo-500/20 dark:border-indigo-400/20',
  },
]

export function ModelShowcase() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  return (
    <section className='px-6 py-16 md:py-24'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-12 text-center'>
          <h2
            className='landing-animate-fade-up text-2xl font-bold tracking-tight opacity-0 md:text-3xl'
            style={{ animationDelay: '480ms' }}
          >
            {isZh ? '覆盖中国主流 AI 模型' : 'Covering Major Chinese AI Models'}
          </h2>
          <p
            className='landing-animate-fade-up text-muted-foreground/70 mt-3 text-sm opacity-0 md:text-base'
            style={{ animationDelay: '540ms' }}
          >
            {isZh
              ? '一个 API Key，访问所有中国 AI 厂商的最新模型'
              : 'One API Key to access the latest models from all major Chinese AI providers'}
          </p>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {modelTypes.map((type, i) => (
            <div
              key={type.title}
              className={`landing-animate-fade-up group ${type.border} bg-card hover:bg-muted/50 rounded-xl border p-5 opacity-0 shadow-xs transition-all duration-300 hover:shadow-md`}
              style={{ animationDelay: `${600 + i * 80}ms` }}
            >
              <div
                className={`${type.bg} mb-3 inline-flex items-center justify-center rounded-lg p-2.5 text-xl`}
              >
                {type.icon}
              </div>
              <h3 className='text-sm font-semibold'>
                {isZh ? type.titleZh : type.title}
              </h3>
              <p className='text-muted-foreground/70 mt-1.5 text-xs leading-relaxed'>
                {isZh ? type.descZh : type.desc}
              </p>
              <p className='text-muted-foreground/40 mt-2 font-mono text-[11px] leading-relaxed'>
                {type.models}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
