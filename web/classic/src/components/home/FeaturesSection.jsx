import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import ScrollReveal from './ScrollReveal';

const features = [
  {
    icon: '🧠',
    title: 'LLM API',
    titleZh: '大语言模型',
    desc: 'Access the newest connected flagship LLMs from DeepSeek, Alibaba, ByteDance, Moonshot, Zhipu and MiniMax through one OpenAI-compatible endpoint.',
    descZh: '访问已接入的 DeepSeek、阿里、字节、月之暗面、智谱、MiniMax 最新旗舰大模型，统一 OpenAI 兼容接口。',
    models: 'DeepSeek V4 Pro · Qwen 3.7 Max · Doubao Seed 2.0 Pro · Kimi K2.6 · GLM-5.1 · MiniMax M2.5',
    gradient: 'radial-gradient(circle at 30% 30%, rgba(0,184,148,0.15) 0%, transparent 70%)',
    accent: '#00b894',
  },
  {
    icon: '🎨',
    title: 'Image Generation',
    titleZh: '图片生成',
    desc: 'Generate production images with the latest connected Seedream and Qwen Image families.',
    descZh: '使用已接入的 Seedream 与 Qwen Image 最新系列生成高质量生产图片。',
    models: 'Doubao Seedream 5.0 Lite · Doubao Seedream 4.5 · Qwen Image 2.0 Pro · Qwen Image 2.0',
    gradient: 'radial-gradient(circle at 70% 30%, rgba(212,77,240,0.15) 0%, transparent 70%)',
    accent: '#d44df0',
  },
  {
    icon: '🎬',
    title: 'Video Generation',
    titleZh: '视频生成',
    desc: 'Create videos with connected Chinese video models, from fast Seedance previews to higher quality generation.',
    descZh: '使用已接入的国产视频模型，从 Seedance 快速预览到高质量生成，覆盖文生视频与图生视频。',
    models: 'Doubao Seedance 2.0 · Doubao Seedance 2.0 Fast · Doubao Seedance 1.5 Pro',
    gradient: 'radial-gradient(circle at 30% 70%, rgba(106,76,245,0.15) 0%, transparent 70%)',
    accent: '#6a4cf5',
  },
  {
    icon: '🎵',
    title: 'Audio & Speech',
    titleZh: '音频与语音',
    desc: 'Use connected Chinese speech and multimodal models for TTS, voice, audio understanding and real-time applications.',
    descZh: '使用已接入的国产语音与多模态模型，覆盖 TTS、语音、音频理解和实时应用。',
    models: 'MiniMax Speech 2.5 · Qwen 3.5 Omni Flash · Doubao TTS · CosyVoice',
    gradient: 'radial-gradient(circle at 70% 70%, rgba(255,122,61,0.15) 0%, transparent 70%)',
    accent: '#ff7a3d',
  },
];

/* ── Spotlight card: radial glow follows cursor ── */
const FeatureCard = ({ f, isChinese, index }) => {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--spotlight-x', `${x}px`);
    card.style.setProperty('--spotlight-y', `${y}px`);
  };

  return (
    <ScrollReveal key={f.title} delay={index * 0.1} className='h-full'>
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className='feature-spotlight-card group relative p-7 h-full min-h-[260px] flex flex-col'
        style={{
          background: 'var(--vc-card-bg)',
          borderRadius: '20px',
          border: '1px solid var(--vc-border)',
          overflow: 'hidden',
        }}
      >
        {/* Cursor-tracking spotlight overlay */}
        <div
          className='spotlight-glow absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none'
          style={{
            background: `radial-gradient(260px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), ${f.accent}18, transparent 70%)`,
          }}
        />

        {/* Hover gradient backdrop */}
        <div
          className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none'
          style={{ background: f.gradient }}
        />

        <div className='relative z-10 flex h-full flex-col'>
          <motion.div
            className='text-3xl mb-4 w-12 h-12 flex items-center justify-center rounded-xl'
            style={{ background: `${f.accent}15` }}
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 16 }}
          >
            {f.icon}
          </motion.div>
          <h3
            className='text-xl font-semibold mb-2'
            style={{ color: 'var(--vc-text-strong)' }}
          >
            {isChinese ? f.titleZh : f.title}
          </h3>
          <p
            className='leading-relaxed mb-3 flex-1'
            style={{ color: 'var(--vc-text-muted)', fontSize: '15px' }}
          >
            {isChinese ? f.descZh : f.desc}
          </p>
          <p
            className='text-xs font-medium uppercase tracking-wider'
            style={{ color: f.accent, opacity: 0.8 }}
          >
            {f.models}
          </p>
        </div>
      </motion.div>
    </ScrollReveal>
  );
};

const FeaturesSection = ({ isMobile }) => {
  const { t, i18n } = useTranslation();
  const isChinese = i18n.language.startsWith('zh');

  return (
    <section className='py-24 px-6' style={{ background: 'var(--vc-section-bg)' }}>
      <div className='max-w-[1200px] mx-auto'>
        {/* Section Header */}
        <ScrollReveal>
          <div className='text-center mb-16'>
            <span
              className='inline-block px-3 py-1 mb-6 text-xs font-semibold uppercase tracking-widest rounded-full'
              style={{
                color: 'var(--vc-text-muted)',
                background: 'var(--vc-glass-bg)',
                border: '1px solid var(--vc-glass-border)',
              }}
            >
              {t('Features')}
            </span>
            <h2
              className='font-bold mb-4'
              style={{
                fontSize: isMobile ? '28px' : '40px',
                color: 'var(--vc-text-strong)',
                letterSpacing: '-0.03em',
              }}
            >
              {t('Everything you need in one API')}
            </h2>
            <p
              className='max-w-2xl mx-auto'
              style={{
                fontSize: '18px',
                color: 'var(--vc-text-muted)',
                letterSpacing: '-0.01em',
              }}
            >
              {t('No more juggling multiple providers. Access the best AI models through a single, unified interface.')}
            </p>
          </div>
        </ScrollReveal>

        {/* Feature Cards */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
          {features.map((f, i) => (
            <FeatureCard key={f.title} f={f} isChinese={isChinese} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
