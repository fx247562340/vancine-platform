import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';

const comparisons = [
  { provider: 'OpenAI', model: 'GPT-4o', price: '$5.00 / 1M', theirPrice: '$2.50 / 1M' },
  { provider: 'Runway', model: 'Gen-3 Alpha', price: '$0.50 / video', theirPrice: '$0.25 / video' },
  { provider: 'Midjourney', model: 'v6.1', price: '$0.06 / image', theirPrice: '$0.03 / image' },
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
              {t('Cheaper')}
            </h2>
            <p
              className='max-w-2xl mx-auto'
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              {t('Access the same models at a fraction of the cost. No subscription, pay only for what you use.')}
            </p>
          </div>
        </ScrollReveal>

        {/* Comparison Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-5 mb-12'>
          {comparisons.map((c, i) => (
            <ScrollReveal key={c.model} delay={i * 0.1}>
              <div
                className='p-6 text-center'
                style={{
                  background: '#141414',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className='text-sm font-medium mb-1' style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.provider}
                </div>
                <div className='text-lg font-semibold mb-4' style={{ color: '#fff' }}>
                  {c.model}
                </div>
                <div className='mb-2'>
                  <span className='text-sm line-through' style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {c.price}
                  </span>
                </div>
                <div
                  className='text-2xl font-bold'
                  style={{ color: '#00b894' }}
                >
                  {c.theirPrice}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal>
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
