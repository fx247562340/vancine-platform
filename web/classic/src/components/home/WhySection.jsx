import React from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';

const WHY_ITEMS = [
  {
    titleKey: 'Fast access to new Chinese models',
    bodyKey:
      'New Chinese model releases can be added to one endpoint instead of a new vendor integration each time.',
  },
  {
    titleKey: 'One compatible API',
    bodyKey:
      'OpenAI-compatible requests, streaming, and tooling patterns you already use.',
  },
  {
    titleKey: 'Unified balance and billing',
    bodyKey:
      'One account, one balance, and one usage log across supported models.',
  },
  {
    titleKey: 'Tested integration examples',
    bodyKey:
      'Public starters and measured agent evidence for supported workflows.',
  },
];

const WhySection = ({ isMobile }) => {
  const { t } = useTranslation();
  return (
    <section
      className='py-24 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-page-bg)' }}
    >
      <div className='max-w-[1200px] mx-auto'>
        <ScrollReveal className='text-center mb-12'>
          <h2
            className='font-bold'
            style={{
              fontSize: isMobile ? '28px' : '44px',
              letterSpacing: '-0.03em',
              color: 'var(--vc-text-strong)',
              lineHeight: 1.1,
            }}
          >
            {t('Why developers use Vancine')}
          </h2>
        </ScrollReveal>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5'>
          {WHY_ITEMS.map((item, i) => (
            <ScrollReveal key={item.titleKey} delay={i * 0.05}>
              <div
                className='h-full rounded-2xl p-6'
                style={{
                  background: 'var(--vc-glass-bg)',
                  border: '1px solid var(--vc-glass-border)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div
                  className='w-10 h-10 rounded-xl mb-4 flex items-center justify-center font-bold'
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(106,76,245,0.18), rgba(0,184,148,0.18))',
                    color: 'var(--vc-text-strong)',
                  }}
                  aria-hidden
                >
                  {i + 1}
                </div>
                <div
                  className='font-semibold text-base mb-2'
                  style={{ color: 'var(--vc-text-strong)' }}
                >
                  {t(item.titleKey)}
                </div>
                <p
                  className='text-sm leading-relaxed'
                  style={{ color: 'var(--vc-text-muted)' }}
                >
                  {t(item.bodyKey)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhySection;
