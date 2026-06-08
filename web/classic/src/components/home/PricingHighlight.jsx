import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';

const comparisons = [
  {
    category: 'LLM',
    items: [
      { ours: 'DeepSeek V4', theirs: 'GPT-4o', save: '80%' },
      { ours: 'Qwen 3.6', theirs: 'Claude Sonnet 4', save: '75%' },
    ],
  },
  {
    category: 'Video',
    items: [
      { ours: 'Wan 2.2', theirs: 'Runway Gen-3', save: '60%' },
      { ours: 'Kling', theirs: 'Sora', save: '50%' },
    ],
  },
  {
    category: 'Image',
    items: [
      { ours: 'FLUX Pro', theirs: 'DALL·E 3', save: '70%' },
      { ours: 'Seedream', theirs: 'Midjourney v6', save: '65%' },
    ],
  },
];

const PricingHighlight = ({ isMobile }) => {
  const { t } = useTranslation();

  return (
    <section className='py-24 px-6' style={{ background: '#090909' }}>
      <div className='max-w-[1200px] mx-auto'>
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
              {t('Pricing')}
            </span>
            <h2
              className='font-bold mb-4'
              style={{
                fontSize: isMobile ? '28px' : '40px',
                color: '#fff',
                letterSpacing: '-0.03em',
              }}
            >
              <span
                style={{
                  background: 'linear-gradient(135deg, #6a4cf5, #00b894)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                3-10x
              </span>{' '}
              {t('Cheaper than International Alternatives')}
            </h2>
            <p
              className='max-w-2xl mx-auto'
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              {t('Same models, same quality, fraction of the cost.')}
            </p>
          </div>
        </ScrollReveal>

        {/* Comparison Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-5 mb-12'>
          {comparisons.map((group, gi) => (
            <ScrollReveal key={group.category} delay={gi * 0.1}>
              <div
                className='p-6'
                style={{
                  background: '#141414',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className='text-xs font-semibold uppercase tracking-widest mb-5'
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {group.category}
                </div>

                <div className='space-y-4'>
                  {group.items.map((item) => (
                    <div key={item.ours} className='flex items-center justify-between'>
                      <div className='flex-1'>
                        <div className='text-sm font-medium' style={{ color: '#fff' }}>
                          {item.ours}
                        </div>
                        <div className='text-xs' style={{ color: 'rgba(255,255,255,0.3)' }}>
                          vs {item.theirs}
                        </div>
                      </div>
                      <div
                        className='px-3 py-1 rounded-full text-sm font-bold'
                        style={{
                          background: 'rgba(0,184,148,0.15)',
                          color: '#00b894',
                        }}
                      >
                        -{item.save}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Bottom note */}
        <ScrollReveal delay={0.3}>
          <div className='text-center mb-8'>
            <p
              className='text-sm'
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              {t('Pay-as-you-go. No subscription. Credits never expire.')}
            </p>
          </div>
          <div className='text-center'>
            <Link to='/pricing'>
              <Button
                size={isMobile ? 'default' : 'large'}
                className='!font-semibold !px-8 !py-3'
                style={{
                  backgroundColor: 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '9999px',
                }}
              >
                {t('View Full Pricing')}
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default PricingHighlight;
