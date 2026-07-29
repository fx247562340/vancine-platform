import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconPlay } from '@douyinfe/semi-icons';
import ScrollReveal from './ScrollReveal';
import { trackEvent } from '../../helpers/analytics';
import { guestPrimaryPath, authPrimaryPath } from './homepage-pricing';

const CTASection = ({ isMobile, isAuthenticated }) => {
  const { t } = useTranslation();
  const primaryPath = isAuthenticated
    ? authPrimaryPath('classic')
    : guestPrimaryPath('classic');

  return (
    <section
      className='py-32 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-section-bg)' }}
    >
      {/* Atmospheric gradient orb */}
      <div
        className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none'
        style={{
          background:
            'radial-gradient(circle, rgba(106,76,245,0.12) 0%, transparent 70%)',
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
            {t('Start building with China’s frontier models')}
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <Link
            to={primaryPath}
            onClick={() =>
              trackEvent('get_started_clicked', { location: 'final_cta' })
            }
          >
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
              {t('Get $1 in free API credit')}
            </Button>
          </Link>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <p
            className='mt-8 max-w-xl mx-auto text-sm leading-relaxed'
            style={{ color: 'var(--vc-text-subtle)' }}
          >
            {t(
              'New accounts may receive $1 in promotional API credit when the current signup bonus is enabled. Credit, eligibility, and availability can change; usage depends on model and workload.',
            )}
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default CTASection;
