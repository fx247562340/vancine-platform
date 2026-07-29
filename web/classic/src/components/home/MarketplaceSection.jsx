import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@douyinfe/semi-ui';
import { IconArrowRight } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';
import { trackEvent } from '../../helpers/analytics';
import { FEATURED_FALLBACK_LABEL, endpointChips } from './homepage-pricing';

const RowChips = ({ types }) => {
  const { chips, overflow } = endpointChips(types);
  if (chips.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1.5'>
      {chips.map((chip) => (
        <span
          key={chip}
          className='text-[11px] px-2 py-0.5 rounded-full font-medium'
          style={{
            background: 'var(--vc-glass-bg)',
            border: '1px solid var(--vc-glass-border)',
            color: 'var(--vc-text-muted)',
          }}
        >
          {chip}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className='text-[11px] px-2 py-0.5 rounded-full font-medium'
          style={{
            background: 'var(--vc-glass-bg)',
            border: '1px solid var(--vc-glass-border)',
            color: 'var(--vc-text-subtle)',
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
};

const SkeletonRow = () => (
  <div
    className='rounded-xl px-5 py-4 flex items-center justify-between gap-4'
    style={{
      background: 'var(--vc-glass-bg)',
      border: '1px solid var(--vc-glass-border)',
    }}
    aria-hidden
  >
    <div
      className='h-4 w-48 max-w-[50%] rounded animate-pulse'
      style={{ background: 'var(--vc-border)' }}
    />
    <div className='flex gap-2'>
      <div
        className='h-5 w-16 rounded-full animate-pulse'
        style={{ background: 'var(--vc-border)' }}
      />
      <div
        className='h-5 w-16 rounded-full animate-pulse'
        style={{ background: 'var(--vc-border)' }}
      />
    </div>
  </div>
);

const MarketplaceSection = ({ pricingState, isMobile }) => {
  const { t } = useTranslation();
  const { status, marketplace, vendors } = pricingState;

  return (
    <section
      className='py-24 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-section-bg)' }}
    >
      <div className='max-w-[960px] mx-auto'>
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
            {t('Live model marketplace')}
          </h2>
          <p
            className='max-w-2xl mx-auto text-base leading-relaxed'
            style={{ color: 'var(--vc-text-muted)' }}
          >
            {t(
              'Browse the full public catalog with live endpoint types and pricing metadata. What you see is served from the same public pricing API developers can query.',
            )}
          </p>
        </ScrollReveal>

        {status === 'loading' ? (
          <div className='flex flex-col gap-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={`sk-${i}`} />
            ))}
          </div>
        ) : marketplace.length > 0 ? (
          <div className='flex flex-col gap-3'>
            {marketplace.map((model) => (
              <Link
                key={model.model_name}
                to='/pricing'
                className='block'
                onClick={() =>
                  trackEvent('explore_models_clicked', {
                    location: 'marketplace',
                  })
                }
              >
                <div
                  className='rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-transform duration-200 hover:-translate-y-0.5'
                  style={{
                    background: 'var(--vc-glass-bg)',
                    border: '1px solid var(--vc-glass-border)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div
                    className='font-semibold text-base break-all'
                    style={{ color: 'var(--vc-text-strong)' }}
                  >
                    {model.model_name}
                  </div>
                  <RowChips types={model.supported_endpoint_types} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className='text-center py-10'>
            <Link
              to='/pricing'
              className='text-base font-medium underline underline-offset-4'
              style={{ color: 'var(--vc-text-strong)' }}
              onClick={() =>
                trackEvent('explore_models_clicked', {
                  location: 'marketplace',
                })
              }
            >
              {t(FEATURED_FALLBACK_LABEL.replace(' →', ''))}
              <span aria-hidden> →</span>
            </Link>
          </div>
        )}

        {/* Connected providers — live vendors[] only; omit entirely if none */}
        {status === 'ready' && vendors.length > 0 ? (
          <div className='mt-10 text-center'>
            <div
              className='text-xs uppercase tracking-[0.2em] font-semibold mb-3'
              style={{ color: 'var(--vc-text-subtle)' }}
            >
              {t('Connected providers')}
            </div>
            <div className='flex flex-wrap items-center justify-center gap-2'>
              {vendors.map((name) => (
                <span
                  key={name}
                  className='text-sm px-3 py-1 rounded-full'
                  style={{
                    background: 'var(--vc-glass-bg)',
                    border: '1px solid var(--vc-glass-border)',
                    color: 'var(--vc-text-muted)',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className='text-center mt-12'>
          <Link
            to='/pricing'
            onClick={() =>
              trackEvent('explore_models_clicked', {
                location: 'marketplace',
              })
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
        </div>
      </div>
    </section>
  );
};

export default MarketplaceSection;
