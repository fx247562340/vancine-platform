import React, { lazy, Suspense } from 'react';
import Loading from '../components/common/ui/Loading';

const WaitlistHero = lazy(() => import('../components/waitlist/WaitlistHero'));
const PricingComparison = lazy(() => import('../components/waitlist/PricingComparison'));
const ModelShowcase = lazy(() => import('../components/waitlist/ModelShowcase'));

function WaitlistPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--semi-color-bg-0)' }}>
      <Suspense fallback={<Loading />}>
        <WaitlistHero />
      </Suspense>
      <Suspense fallback={null}>
        <PricingComparison />
      </Suspense>
      <Suspense fallback={null}>
        <ModelShowcase />
      </Suspense>
      {/* Simple footer */}
      <div style={{
        padding: '40px 24px', textAlign: 'center', fontSize: 13, opacity: 0.4,
        borderTop: '1px solid var(--semi-color-border)',
      }}>
        © 2026 Vancine. All rights reserved.
      </div>
    </div>
  );
}

export default WaitlistPage;
