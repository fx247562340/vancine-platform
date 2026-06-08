import React from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { IconCopy, IconPlay, IconFile } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const HeroSection = ({ serverAddress, modelCount, docsLink, onCopy, isMobile }) => {
  const { t } = useTranslation();

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
        style={{ filter: 'brightness(0.35)' }}
      >
        <source src='/hero-bg.mp4' type='video/mp4' />
      </video>

      {/* Gradient Overlay */}
      <div
        className='absolute inset-0'
        style={{
          background: 'linear-gradient(180deg, rgba(9,9,9,0.4) 0%, rgba(9,9,9,0.6) 50%, rgba(9,9,9,1) 100%)',
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className='absolute inset-0 opacity-[0.03]'
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content */}
      <div className='relative z-10 max-w-[1200px] mx-auto px-6 text-center text-white py-20'>
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className='inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full text-sm font-medium'
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('Now available — Chinese AI models for global developers')}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className='font-bold leading-[1.0] mb-6'
          style={{
            fontSize: isMobile ? '48px' : 'clamp(56px, 8vw, 110px)',
            letterSpacing: '-0.04em',
          }}
        >
          {t('One API,')}
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #6a4cf5 0%, #d44df0 50%, #00b894 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {t('Infinite Creativity')}
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className='max-w-2xl mx-auto mb-10 leading-relaxed'
          style={{
            fontSize: isMobile ? '16px' : '20px',
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: '-0.01em',
          }}
        >
          {t('Generate videos, images, music, and text with the best AI models — at a fraction of the cost.')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className='flex flex-col sm:flex-row items-center justify-center gap-4 mb-12'
        >
          <Link to='/console'>
            <Button
              size={isMobile ? 'default' : 'large'}
              className='!font-semibold !px-8 !py-3'
              style={{
                backgroundColor: '#fff',
                color: '#090909',
                border: 'none',
                borderRadius: '9999px',
              }}
              icon={<IconPlay />}
            >
              {t('Get Started Free')}
            </Button>
          </Link>
          {docsLink && (
            <Link to='/docs'>
              <Button
                size={isMobile ? 'default' : 'large'}
                className='!font-semibold !px-8 !py-3'
                style={{
                  backgroundColor: 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '9999px',
                }}
                icon={<IconFile />}
              >
                {t('Documentation')}
              </Button>
            </Link>
          )}
        </motion.div>

        {/* Base URL */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className='max-w-lg mx-auto'
        >
          <div className='mb-2 text-xs uppercase tracking-widest' style={{ color: 'rgba(255,255,255,0.35)' }}>
            API Base URL
          </div>
          <Input
            readonly
            value={serverAddress + '/v1'}
            className='!bg-white/[0.06] !border-white/[0.1] !text-white'
            style={{ borderRadius: '12px' }}
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

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className='mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16'
        >
          {[
            { value: `${modelCount}+`, label: t('AI Models') },
            { value: '3-10x', label: t('Cheaper') },
            { value: '1', label: t('Unified API') },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <div className='w-px h-10 hidden md:block' style={{ background: 'rgba(255,255,255,0.1)' }} />}
              <div className='text-center'>
                <div className='text-3xl font-bold text-white'>{stat.value}</div>
                <div className='text-sm mt-1' style={{ color: 'rgba(255,255,255,0.4)' }}>
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
        style={{ background: 'linear-gradient(to top, #090909, transparent)' }}
      />
    </section>
  );
};

export default HeroSection;
