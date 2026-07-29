import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '../../helpers/analytics';
import ScrollReveal from './ScrollReveal';
import {
  FEATURED_FALLBACK_LABEL,
  endpointChips,
  resolveVendorName,
  skeletonCountForWidth,
} from './homepage-pricing';

const useViewportWidth = () => {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
};

const SectionHeading = ({ eyebrow, title, isMobile }) => (
  <ScrollReveal className='text-center mb-12'>
    {eyebrow ? (
      <div
        className='text-xs uppercase tracking-[0.2em] font-semibold mb-3'
        style={{ color: 'var(--vc-text-subtle)' }}
      >
        {eyebrow}
      </div>
    ) : null}
    <h2
      className='font-bold'
      style={{
        fontSize: isMobile ? '28px' : '44px',
        letterSpacing: '-0.03em',
        color: 'var(--vc-text-strong)',
        lineHeight: 1.1,
      }}
    >
      {title}
    </h2>
  </ScrollReveal>
);

const EndpointChips = ({ types }) => {
  const { chips, overflow } = endpointChips(types);
  if (chips.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1.5 mt-3'>
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

const ModelCard = ({ model, vendors }) => {
  const vendorName = resolveVendorName(model.vendor_id, vendors);
  return (
    <Link
      to='/pricing'
      className='block h-full'
      onClick={() =>
        trackEvent('featured_model_clicked', {
          location: 'available_now',
          model: model.model_name,
        })
      }
    >
      <div
        className='h-full rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-1'
        style={{
          background: 'var(--vc-glass-bg)',
          border: '1px solid var(--vc-glass-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className='font-semibold text-base mb-1 break-all'
          style={{ color: 'var(--vc-text-strong)' }}
        >
          {model.model_name}
        </div>
        {vendorName ? (
          <div
            className='text-xs mb-2'
            style={{ color: 'var(--vc-text-subtle)' }}
          >
            {vendorName}
          </div>
        ) : null}
        {model.description && model.description.trim() !== '' ? (
          <p
            className='text-sm leading-relaxed line-clamp-2'
            style={{ color: 'var(--vc-text-muted)' }}
          >
            {model.description}
          </p>
        ) : null}
        <EndpointChips types={model.supported_endpoint_types} />
      </div>
    </Link>
  );
};

const SkeletonCard = () => (
  <div
    className='rounded-2xl p-5 h-[140px]'
    style={{
      background: 'var(--vc-glass-bg)',
      border: '1px solid var(--vc-glass-border)',
    }}
    aria-hidden
  >
    <div
      className='h-4 w-2/3 rounded mb-3 animate-pulse'
      style={{ background: 'var(--vc-border)' }}
    />
    <div
      className='h-3 w-1/2 rounded mb-4 animate-pulse'
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

const FallbackLink = ({ location }) => {
  const { t } = useTranslation();
  return (
    <div className='text-center py-10'>
      <Link
        to='/pricing'
        className='text-base font-medium underline underline-offset-4'
        style={{ color: 'var(--vc-text-strong)' }}
        onClick={() => trackEvent('explore_models_clicked', { location })}
      >
        {t(FEATURED_FALLBACK_LABEL.replace(' →', ''))}
        <span aria-hidden> →</span>
      </Link>
    </div>
  );
};

const AvailableNowSection = ({ pricingState, isMobile }) => {
  const { t } = useTranslation();
  const width = useViewportWidth();
  const { status, featured, count, rawVendors } = pricingState;

  const skeletonCount = skeletonCountForWidth(width);

  return (
    <section
      className='py-24 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-section-bg)' }}
    >
      <div className='max-w-[1200px] mx-auto'>
        <SectionHeading title={t('Available now')} isMobile={isMobile} />

        {status === 'loading' ? (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5'>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <SkeletonCard key={`sk-${i}`} />
            ))}
          </div>
        ) : (
          <>
            {featured.length > 0 ? (
              <>
                <p
                  className='text-center text-sm mb-6 max-w-2xl mx-auto'
                  style={{ color: 'var(--vc-text-muted)' }}
                >
                  {t(
                    'Featured models live on the public catalog. Open a model or browse the full marketplace.',
                  )}
                </p>
                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5'>
                  {featured.map((model) => (
                    <ModelCard
                      key={model.model_name}
                      model={model}
                      vendors={rawVendors}
                    />
                  ))}
                </div>
              </>
            ) : (
              <FallbackLink location='available_now_fallback' />
            )}
            {/* Real model count: shown whenever the public catalog parsed with
                >=1 models, including the 0-featured fallback. Never shown on
                loading or error. */}
            {status === 'ready' && typeof count === 'number' && count >= 1 ? (
              <p
                className='text-center text-sm mt-6'
                style={{ color: 'var(--vc-text-subtle)' }}
              >
                {t('{{count}} models available', { count })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default AvailableNowSection;
