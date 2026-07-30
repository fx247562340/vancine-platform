import React from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';
import SpotlightCard from './SpotlightCard';

const STACK_ITEMS = [
  {
    titleKey: 'OpenCode',
    bodyKey:
      'Live-verified with Kimi K3 in a controlled coding-agent run. View the evidence section below.',
    qualification: 'Live-verified',
  },
  {
    titleKey: 'Cline',
    bodyKey:
      'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    titleKey: 'Roo Code',
    bodyKey:
      'Configuration-ready OpenAI-compatible setup. Not claimed as a completed Vancine live coding-agent verification on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    titleKey: 'Claude Code',
    bodyKey:
      'Compatible via OpenAI-compatible / documented gateway usage patterns. No Vancine-owned end-to-end coding-agent benchmark is claimed on the homepage.',
    qualification: 'Configuration-ready',
  },
  {
    titleKey: 'OpenAI SDK',
    bodyKey: 'First-class: standard OpenAI SDK against https://vancine.com/v1.',
    qualification: 'Configuration-ready',
  },
  {
    titleKey: 'Pi Coding Agent',
    bodyKey:
      "Configuration-ready through Pi's custom OpenAI-compatible provider support. Not claimed as a completed Vancine live coding-agent verification on the homepage.",
    qualification: 'Configuration-ready',
  },
];

const StackSection = ({ isMobile }) => {
  const { t } = useTranslation();
  return (
    <section
      className='py-24 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-page-bg)' }}
    >
      <div className='max-w-[1200px] mx-auto'>
        <ScrollReveal className='text-center mb-12'>
          <h2
            className='font-bold mb-4'
            style={{
              fontSize: isMobile ? '28px' : '44px',
              letterSpacing: '-0.03em',
              color: 'var(--vc-text-strong)',
              lineHeight: 1.1,
            }}
          >
            {t('Works with your stack')}
          </h2>
          <p
            className='max-w-2xl mx-auto text-base leading-relaxed'
            style={{ color: 'var(--vc-text-muted)' }}
          >
            {t(
              'Point your existing OpenAI-compatible clients at Vancine. Compatibility depth differs by client — we label what is live-verified versus configuration-ready.',
            )}
          </p>
        </ScrollReveal>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'>
          {STACK_ITEMS.map((item, i) => (
            <ScrollReveal key={item.titleKey} delay={i * 0.05}>
              <SpotlightCard className='h-full p-6'>
                <div
                  className='font-semibold text-lg mb-2'
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
                <div className='mt-3'>
                  <span
                    className='inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium'
                    style={{
                      background: 'var(--vc-glass-bg)',
                      border: '1px solid var(--vc-glass-border)',
                      color: 'var(--vc-text-subtle)',
                    }}
                  >
                    {t(item.qualification)}
                  </span>
                </div>
              </SpotlightCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StackSection;