import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconPlay } from '@douyinfe/semi-icons';
import ScrollReveal from './ScrollReveal';

const CTASection = ({ isMobile }) => {
  const { t } = useTranslation();

  return (
    <section className='py-32 px-6 relative overflow-hidden' style={{ background: 'var(--vc-section-bg)' }}>
      {/* Atmospheric gradient orb */}
      <div
        className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none'
        style={{
          background: 'radial-gradient(circle, rgba(106,76,245,0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className='max-w-[800px] mx-auto text-center relative z-10'>
        <ScrollReveal>
          <h2
            className='font-bold mb-6'
            style={{
              fontSize: isMobile ? '32px' : '56px',
              color: 'var(--vc-text-strong)',
              letterSpacing: '-0.04em',
              lineHeight: 1.1,
            }}
          >
            {t('Start Building')}{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #6a4cf5, #d44df0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('Today')}
            </span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p
            className='mb-10 max-w-xl mx-auto'
            style={{
              fontSize: '18px',
              color: 'var(--vc-text-muted)',
              lineHeight: 1.6,
            }}
          >
            {t('No credit card required. Start with free credits and scale as you grow.')}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <Link to='/console'>
            <Button
              size={isMobile ? 'default' : 'large'}
              className='!font-semibold !px-10 !py-4'
              style={{
                backgroundColor: 'var(--vc-inverse-bg)',
                color: 'var(--vc-inverse-text)',
                border: 'none',
                borderRadius: '9999px',
                fontSize: '16px',
              }}
              icon={<IconPlay />}
            >
              {t('Get Started Free')}
            </Button>
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default CTASection;
