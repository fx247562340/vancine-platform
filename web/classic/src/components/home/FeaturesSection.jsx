import React from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';

const features = [
  {
    icon: '🎬',
    title: 'Video Generation',
    titleZh: '视频生成',
    desc: 'Generate stunning videos from text or images with Wan, Kling, and more.',
    descZh: '使用 Wan、Kling 等模型，从文本或图片生成高质量视频。',
    models: 'Wan 2.2 · Kling · Hailuo',
    gradient: 'radial-gradient(circle at 30% 30%, rgba(106,76,245,0.15) 0%, transparent 70%)',
    accent: '#6a4cf5',
  },
  {
    icon: '🎨',
    title: 'Image Generation',
    titleZh: '图片生成',
    desc: 'Create high-quality images with FLUX, Qwen-Image, Seedream, and more.',
    descZh: '使用 FLUX、Qwen-Image、Seedream 等模型生成高质量图片。',
    models: 'FLUX · Qwen-Image · Seedream',
    gradient: 'radial-gradient(circle at 70% 30%, rgba(212,77,240,0.15) 0%, transparent 70%)',
    accent: '#d44df0',
  },
  {
    icon: '🧠',
    title: 'LLM API',
    titleZh: '大语言模型',
    desc: 'Access the best Chinese LLMs through a single OpenAI-compatible endpoint.',
    descZh: '通过统一的 OpenAI 兼容接口访问最强大的中文大语言模型。',
    models: 'DeepSeek V4 · Qwen 3.6 · GLM 5.1',
    gradient: 'radial-gradient(circle at 30% 70%, rgba(0,184,148,0.15) 0%, transparent 70%)',
    accent: '#00b894',
  },
  {
    icon: '🎵',
    title: 'Music Generation',
    titleZh: '音乐生成',
    desc: 'Compose full songs with vocals and instruments from text descriptions.',
    descZh: '从文本描述生成完整的歌曲，包含人声和乐器。',
    models: 'Suno · Udio',
    gradient: 'radial-gradient(circle at 70% 70%, rgba(255,122,61,0.15) 0%, transparent 70%)',
    accent: '#ff7a3d',
  },
];

const FeaturesSection = ({ isMobile }) => {
  const { t, i18n } = useTranslation();
  const isChinese = i18n.language.startsWith('zh');

  return (
    <section className='py-24 px-6' style={{ background: '#090909' }}>
      <div className='max-w-[1200px] mx-auto'>
        {/* Section Header */}
        <ScrollReveal>
          <div className='text-center mb-16'>
            <span
              className='inline-block px-3 py-1 mb-6 text-xs font-semibold uppercase tracking-widest rounded-full'
              style={{
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {t('Features')}
            </span>
            <h2
              className='font-bold mb-4'
              style={{
                fontSize: isMobile ? '28px' : '40px',
                color: '#fff',
                letterSpacing: '-0.03em',
              }}
            >
              {t('Everything you need in one API')}
            </h2>
            <p
              className='max-w-2xl mx-auto'
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.45)',
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
            <ScrollReveal key={f.title} delay={i * 0.1}>
              <div
                className='group relative p-7 transition-all duration-300 hover:-translate-y-1'
                style={{
                  background: '#141414',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                {/* Gradient spotlight */}
                <div
                  className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'
                  style={{ background: f.gradient }}
                />

                <div className='relative z-10'>
                  <div
                    className='text-3xl mb-4 w-12 h-12 flex items-center justify-center rounded-xl'
                    style={{ background: `${f.accent}15` }}
                  >
                    {f.icon}
                  </div>
                  <h3
                    className='text-xl font-semibold mb-2'
                    style={{ color: '#fff' }}
                  >
                    {isChinese ? f.titleZh : f.title}
                  </h3>
                  <p
                    className='leading-relaxed mb-3'
                    style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}
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
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
