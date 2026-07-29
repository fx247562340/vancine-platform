import React, { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { IconCopy, IconPlay, IconArrowRight } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { trackEvent } from '../../helpers/analytics';
import { guestPrimaryPath, authPrimaryPath } from './homepage-pricing';
import {
  splitHeadlineWords,
  buildWordRevealMotion,
  deriveWordRevealMode,
  shouldStickWordRevealInstant,
  describeWordSegment,
} from './word-reveal';

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
    animate={{
      x: [0, 30, -20, 0],
      y: [0, -20, 30, 0],
      scale: [1, 1.15, 0.9, 1],
    }}
    transition={{ duration: 18, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

/* ── Word-by-word reveal for headline ──
 * Entrance stagger runs once on first mount. After the component has mounted,
 * any text change (language switch) must show every segment immediately —
 * newly mounted spans must not inherit opacity:0 + delay (zh→en/fr/vi used
 * to lag the tail of the title).
 *
 * Render is pure: refs are READ-ONLY here. Mode for the current text-change
 * commit is derived from last-committed ref snapshots so language switches
 * are instant in the SAME commit (no waiting for an effect). Refs + sticky
 * state are updated in useEffect after commit. First-mount effect never
 * setStates, so the entrance animation is not cut short.
 */
const WordReveal = ({
  text,
  delay = 0,
  duration = 0.4,
  reducedMotion = false,
}) => {
  const hasMountedRef = useRef(false);
  const previousTextRef = useRef(text);
  // Sticky: once a real post-mount text change commits, stay on instant
  // forever (including switch-back to the original language).
  const [hasCompletedEntrance, setHasCompletedEntrance] = useState(false);

  // READ-ONLY derivation from last committed refs — never write ref.current here.
  const mode = deriveWordRevealMode({
    hasMounted: hasMountedRef.current,
    previousText: previousTextRef.current,
    text,
    hasCompletedEntrance,
  });

  useEffect(() => {
    const shouldStick = shouldStickWordRevealInstant({
      hasMounted: hasMountedRef.current,
      previousText: previousTextRef.current,
      text,
      hasCompletedEntrance,
    });

    hasMountedRef.current = true;
    previousTextRef.current = text;

    // First mount: shouldStick is false → no setState (preserve entrance).
    if (shouldStick) {
      setHasCompletedEntrance(true);
    }
  }, [text, hasCompletedEntrance]);

  const words = splitHeadlineWords(text);

  return (
    <>
      {words.map((word, i) => {
        const seg = describeWordSegment(word);
        // Whitespace renders as an inline span with white-space: pre-wrap so the
        // gap stays visible (a lone space inside inline-block collapses to zero
        // width) while the headline can still wrap on narrow viewports. It never
        // needs the entrance animation, so it is always visible — no reflow on
        // language switch.
        if (seg.isWhitespace) {
          return (
            <span key={i} style={seg.style}>
              {seg.text}
            </span>
          );
        }
        const motionProps = buildWordRevealMotion({
          index: i,
          baseDelay: delay,
          duration,
          mode,
          reducedMotion,
        });
        return (
          <motion.span
            key={i}
            initial={motionProps.initial}
            animate={motionProps.animate}
            transition={motionProps.transition}
            style={seg.style}
          >
            {seg.text}
          </motion.span>
        );
      })}
    </>
  );
};

/* Entrance delays are capped so the primary CTA reaches full visibility
 * within ~1.2s wall time after mount. */
const HERO_ENTRANCE = {
  badge: 0.05,
  headline: 0.1,
  sub: 0.35,
  cta: 0.55,
  docs: 0.6,
  url: 0.7,
  stats: 0.85,
};

const entrance = (delay, reducedMotion) => {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0, delay: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay },
  };
};

const HeroSection = ({
  serverAddress,
  modelCount,
  docsLink,
  onCopy,
  isMobile,
  isAuthenticated,
}) => {
  const { t } = useTranslation();
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const videoRef = useRef(null);
  const videoFailedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || prefersReduced) return undefined;
    // 延迟到浏览器空闲再播放，避免与首屏关键资源竞争带宽。
    // 播放失败时保留 poster，不循环重试。
    const start = () => {
      if (videoFailedRef.current) return;
      video.play().catch(() => {});
    };
    const onError = () => {
      videoFailedRef.current = true;
    };
    video.addEventListener('error', onError);
    let id;
    if ('requestIdleCallback' in window) {
      id = window.requestIdleCallback(start, { timeout: 1500 });
    } else {
      id = setTimeout(start, 300);
    }
    return () => {
      video.removeEventListener('error', onError);
      if ('requestIdleCallback' in window) {
        window.cancelIdleCallback(id);
      } else {
        clearTimeout(id);
      }
    };
  }, [prefersReduced]);

  const primaryPath = isAuthenticated
    ? authPrimaryPath('classic')
    : guestPrimaryPath('classic');

  const stats = [];
  if (typeof modelCount === 'number' && modelCount >= 1) {
    stats.push({ value: String(modelCount), label: t('AI Models') });
  }
  stats.push({ value: 'OpenAI', label: t('Compatible') });
  stats.push({ value: '1', label: t('API Endpoint') });

  return (
    <section className='relative w-full h-screen min-h-[600px] flex items-center justify-center overflow-hidden'>
      {/* Video Background — poster remains on failure / reduced motion */}
      <video
        ref={videoRef}
        loop
        muted
        playsInline
        poster='/hero-poster.jpg'
        preload='metadata'
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
          <AuroraBlob
            color='rgba(106,76,245,0.12)'
            size='520px'
            top='-10%'
            left='15%'
            delay={0}
          />
          <AuroraBlob
            color='rgba(212,77,240,0.08)'
            size='440px'
            top='30%'
            left='65%'
            delay={4}
          />
          <AuroraBlob
            color='rgba(0,184,148,0.06)'
            size='380px'
            top='55%'
            left='35%'
            delay={8}
          />
        </div>
      )}

      {/* Content */}
      <div
        className='relative z-10 max-w-[1200px] mx-auto px-6 text-center py-20'
        style={{ color: 'var(--vc-text-strong)' }}
      >
        {/* Eyebrow badge */}
        <motion.div
          {...entrance(HERO_ENTRANCE.badge, prefersReduced)}
          className='inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full text-sm font-medium'
          style={{
            background: 'var(--vc-glass-bg)',
            border: '1px solid var(--vc-glass-border)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
          <span style={{ color: 'var(--vc-text-body)' }}>
            {t('OpenAI-compatible access to China’s frontier AI')}
          </span>
        </motion.div>

        {/* Headline — evergreen: no concrete model names */}
        <h1
          className='font-bold leading-[1.05] mb-6'
          style={{
            fontSize: isMobile ? '40px' : 'clamp(44px, 7vw, 92px)',
            letterSpacing: '-0.04em',
            color: 'var(--vc-text-strong)',
          }}
        >
          <WordReveal
            text={t('China’s frontier AI models.')}
            delay={HERO_ENTRANCE.headline}
            reducedMotion={prefersReduced}
          />
          <br />
          <span
            style={{
              background:
                'linear-gradient(135deg, #6a4cf5 0%, #d44df0 50%, #00b894 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            <WordReveal
              text={t('One API.')}
              delay={HERO_ENTRANCE.headline + 0.15}
              duration={0.4}
              reducedMotion={prefersReduced}
            />
          </span>
        </h1>

        {/* Subheadline */}
        <motion.p
          {...entrance(HERO_ENTRANCE.sub, prefersReduced)}
          className='max-w-2xl mx-auto mb-10 leading-relaxed'
          style={{
            fontSize: isMobile ? '16px' : '20px',
            color: 'var(--vc-text-muted)',
            letterSpacing: '-0.01em',
          }}
        >
          {t(
            'Build with leading Chinese models through one OpenAI-compatible endpoint. Use the SDKs and agent tools you already know.',
          )}
        </motion.p>

        {/* CTAs */}
        <motion.div
          {...entrance(HERO_ENTRANCE.cta, prefersReduced)}
          className='flex flex-col sm:flex-row items-center justify-center gap-4 mb-4'
        >
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              to={primaryPath}
              onClick={() =>
                trackEvent('get_started_clicked', { location: 'hero' })
              }
            >
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
                {t('Start building free')}
              </Button>
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              to='/pricing'
              onClick={() =>
                trackEvent('explore_models_clicked', { location: 'hero' })
              }
            >
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
                icon={<IconArrowRight />}
              >
                {t('Explore live models')}
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* Docs — weak tertiary text link only; hidden when unconfigured */}
        {docsLink ? (
          <motion.div
            {...entrance(HERO_ENTRANCE.docs, prefersReduced)}
            className='mb-12'
          >
            {docsLink.startsWith('http') ? (
              <a
                href={docsLink}
                target='_blank'
                rel='noopener noreferrer'
                className='text-sm underline underline-offset-4'
                style={{ color: 'var(--vc-text-muted)' }}
              >
                {t('Documentation')}
              </a>
            ) : (
              <Link
                to={docsLink}
                className='text-sm underline underline-offset-4'
                style={{ color: 'var(--vc-text-muted)' }}
              >
                {t('Documentation')}
              </Link>
            )}
          </motion.div>
        ) : (
          <div className='mb-12' aria-hidden />
        )}

        {/* Base URL */}
        <motion.div
          {...entrance(HERO_ENTRANCE.url, prefersReduced)}
          className='max-w-lg mx-auto'
        >
          <div
            className='mb-2 text-xs uppercase tracking-widest'
            style={{ color: 'var(--vc-text-subtle)' }}
          >
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

        {/* Stats — honest values; model count only after successful parse */}
        <motion.div
          {...entrance(HERO_ENTRANCE.stats, prefersReduced)}
          className='mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16'
        >
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && (
                <div
                  className='w-px h-10 hidden md:block'
                  style={{ background: 'var(--vc-border)' }}
                />
              )}
              <div className='text-center'>
                <div
                  className='text-3xl font-bold'
                  style={{ color: 'var(--vc-text-strong)' }}
                >
                  {stat.value}
                </div>
                <div
                  className='text-sm mt-1'
                  style={{ color: 'var(--vc-text-muted)' }}
                >
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
