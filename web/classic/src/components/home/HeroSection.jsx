import React, { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { IconCopy, IconPlay, IconFile } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

/* ── Aurora blobs: slow drifting soft lights behind the hero ── */
const AuroraBlob = ({ color, size, top, left, delay = 0 }) => (
  <motion.div
    className='absolute rounded-full pointer-events-none'
    style={{
      width: size,
      height: size,
      top,
      left,
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      filter: 'blur(80px)',
    }}
    animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.15, 0.9, 1] }}
    transition={{ duration: 18, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

/* ── Word-by-word reveal for headline ── */
const WordReveal = ({ text, delay = 0, duration = 0.4 }) => {
  const words = text.split(/(\s+)/);
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: delay + i * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ display: 'inline-block' }}
        >
          {word === ' ' ? ' ' : word}
        </motion.span>
      ))}
    </>
  );
};

/* ── Count-up number animation ── */
const CountUp = ({ end, suffix = '', duration = 1.6 }) => {
  const [count, setCount] = useState(0);
  const [ref, setRef] = useState(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref || hasAnimated.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const numEnd = parseInt(end, 10) || 0;
          const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * numEnd));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, end, duration]);

  return <span ref={setRef}>{count}{suffix}</span>;
};

const HeroSection = ({ serverAddress, modelCount, docsLink, onCopy, isMobile }) => {
  const { t } = useTranslation();
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <section className='relative w-full h-screen min-h-[600px] flex items-center justify-center overflow-hidden'>
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload='auto'
        className='absolute inset-0 w-full h-full object-cover'
        style={{ filter: 'var(--vc-hero-video-filter)' }}
      >
        <source src='/hero-bg.mp4' type='video/mp4' />
      </video>

      {/* Gradient Overlay */}
      <div
        className='absolute inset-0'
        style={{ background: 'var(--vc-hero-overlay)' }}
      />

      {/* Subtle grid pattern */}
      <div
        className='absolute inset-0 opacity-[0.08]'
        style={{
          backgroundImage:
            'linear-gradient(var(--vc-hero-grid) 1px, transparent 1px), linear-gradient(90deg, var(--vc-hero-grid) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Aurora blobs (dark mode only, disabled for reduced-motion) */}
      {!prefersReduced && (
        <div className='dark-only' aria-hidden>
          <AuroraBlob color='rgba(106,76,245,0.12)' size='520px' top='-10%' left='15%' delay={0} />
          <AuroraBlob color='rgba(212,77,240,0.08)' size='440px' top='30%' left='65%' delay={4} />
          <AuroraBlob color='rgba(0,184,148,0.06)' size='380px' top='55%' left='35%' delay={8} />
        </div>
      )}

      {/* Content */}
      <div className='relative z-10 max-w-[1200px] mx-auto px-6 text-center py-20' style={{ color: 'var(--vc-text-strong)' }}>
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className='inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full text-sm font-medium'
          style={{
            background: 'var(--vc-glass-bg)',
            border: '1px solid var(--vc-glass-border)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
          <span style={{ color: 'var(--vc-text-body)' }}>
            {t('Now available — Chinese AI models for global developers')}
          </span>
        </motion.div>

        {/* Headline — word-by-word reveal */}
        <h1
          className='font-bold leading-[1.0] mb-6'
          style={{
            fontSize: isMobile ? '48px' : 'clamp(56px, 8vw, 110px)',
            letterSpacing: '-0.04em',
            color: 'var(--vc-text-strong)',
          }}
        >
          <WordReveal text={t('One API,')} delay={0.4} />
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #6a4cf5 0%, #d44df0 50%, #00b894 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            <WordReveal text={t('Infinite Creativity')} delay={0.8} duration={0.45} />
          </span>
        </h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4 }}
          className='max-w-2xl mx-auto mb-10 leading-relaxed'
          style={{
            fontSize: isMobile ? '16px' : '20px',
            color: 'var(--vc-text-muted)',
            letterSpacing: '-0.01em',
          }}
        >
          {t('Generate videos, images, music, and text with the best AI models — at a fraction of the cost.')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.6 }}
          className='flex flex-col sm:flex-row items-center justify-center gap-4 mb-12'
        >
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link to='/console'>
              <Button
                size={isMobile ? 'default' : 'large'}
                className='!font-semibold !px-8 !py-3'
                style={{
                  backgroundColor: 'var(--vc-inverse-bg)',
                  color: 'var(--vc-inverse-text)',
                  border: 'none',
                  borderRadius: '9999px',
                }}
                icon={<IconPlay />}
              >
                {t('Get Started Free')}
              </Button>
            </Link>
          </motion.div>
          {docsLink && (
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link to='/docs'>
                <Button
                  size={isMobile ? 'default' : 'large'}
                  className='!font-semibold !px-8 !py-3'
                  style={{
                    backgroundColor: 'var(--vc-glass-bg)',
                    color: 'var(--vc-text-strong)',
                    border: '1px solid var(--vc-glass-border)',
                    borderRadius: '9999px',
                    backdropFilter: 'blur(12px)',
                  }}
                  icon={<IconFile />}
                >
                  {t('Documentation')}
                </Button>
              </Link>
            </motion.div>
          )}
        </motion.div>

        {/* Base URL */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.8 }}
          className='max-w-lg mx-auto'
        >
          <div className='mb-2 text-xs uppercase tracking-widest' style={{ color: 'var(--vc-text-subtle)' }}>
            API Base URL
          </div>
          <Input
            readonly
            value={serverAddress + '/v1'}
            className='home-base-url-input'
            style={{
              borderRadius: '12px',
              background: 'var(--vc-glass-bg)',
              borderColor: 'var(--vc-glass-border)',
              color: 'var(--vc-text-strong)',
              backdropFilter: 'blur(12px)',
            }}
            size={isMobile ? 'default' : 'large'}
            suffix={
              <Button
                type='primary'
                onClick={onCopy}
                icon={<IconCopy />}
                style={{ borderRadius: '8px' }}
                size='small'
              />
            }
          />
        </motion.div>

        {/* Stats — count-up animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 2.0 }}
          className='mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16'
        >
          {[
            { value: modelCount, suffix: '+', label: t('AI Models') },
            { value: 10, suffix: 'x', label: t('Cheaper') },
            { value: 1, suffix: '', label: t('Unified API') },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <div className='w-px h-10 hidden md:block' style={{ background: 'var(--vc-border)' }} />}
              <div className='text-center'>
                <div className='text-3xl font-bold' style={{ color: 'var(--vc-text-strong)' }}>
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </div>
                <div className='text-sm mt-1' style={{ color: 'var(--vc-text-muted)' }}>
                  {stat.label}
                </div>
              </div>
            </React.Fragment>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div
        className='absolute bottom-0 left-0 right-0 h-32'
        style={{ background: 'var(--vc-hero-bottom-fade)' }}
      />
    </section>
  );
};

export default HeroSection;
