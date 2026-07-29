import React from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';
import { trackEvent } from '../../helpers/analytics';
import {
  KIMI_K3_OPENCODE_VERIFICATION,
  KIMI_K3_MEASURED_USAGE,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_URL,
} from '../../pages/KimiK3Api/landing';

const totalToolCalls = (toolCalls) =>
  Object.values(toolCalls || {}).reduce(
    (acc, v) => acc + (v?.completed || 0) + (v?.failed || 0),
    0,
  );

const EvidenceSection = ({ isMobile }) => {
  const { t } = useTranslation();
  const v = KIMI_K3_OPENCODE_VERIFICATION;
  const usage = KIMI_K3_MEASURED_USAGE;
  const toolCount = totalToolCalls(v.toolCalls);
  const durationSeconds = (v.durationMs / 1000).toFixed(1);

  const metrics = [
    {
      value: `v${v.clientVersion}`,
      label: t('OpenCode version'),
    },
    { value: v.model, label: t('Model under test') },
    { value: v.modelSteps, label: t('Model steps') },
    { value: toolCount, label: t('Tool calls') },
    {
      value: v.testsPassed ? t('Passed') : t('Failed'),
      label: t('Tests'),
    },
    {
      value: `${durationSeconds}s`,
      label: t('Duration'),
    },
    {
      value: usage.agentTelemetryTokens.toLocaleString('en-US'),
      label: t('Agent telemetry tokens'),
    },
    {
      value: `$${usage.amount.toFixed(2)}`,
      label: t('Vancine measured usage'),
    },
  ];

  const evidenceLink = (href, resource, label) => (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='text-sm font-medium underline underline-offset-4'
      style={{ color: 'var(--vc-text-strong)' }}
      onClick={() =>
        trackEvent('evidence_link_clicked', {
          location: 'homepage',
          resource,
        })
      }
    >
      {t(label)}
    </a>
  );

  return (
    <section
      className='py-24 px-6 relative overflow-hidden'
      style={{ background: 'var(--vc-section-bg)' }}
    >
      <div className='max-w-[960px] mx-auto'>
        <ScrollReveal className='text-center mb-10'>
          <h2
            className='font-bold mb-4'
            style={{
              fontSize: isMobile ? '28px' : '44px',
              letterSpacing: '-0.03em',
              color: 'var(--vc-text-strong)',
              lineHeight: 1.1,
            }}
          >
            {t('Verified in real agent workflows')}
          </h2>
          <p
            className='max-w-2xl mx-auto text-base leading-relaxed'
            style={{ color: 'var(--vc-text-muted)' }}
          >
            {t(
              'One controlled historical run — not a promise that every request will match these numbers.',
            )}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div
            className='rounded-2xl p-6 md:p-10'
            style={{
              background: 'var(--vc-glass-bg)',
              border: '1px solid var(--vc-glass-border)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className='grid grid-cols-2 md:grid-cols-4 gap-6 mb-8'>
              {metrics.map((m) => (
                <div key={m.label} className='text-center'>
                  <div
                    className='text-2xl font-bold'
                    style={{ color: 'var(--vc-text-strong)' }}
                  >
                    {m.value}
                  </div>
                  <div
                    className='text-xs mt-1'
                    style={{ color: 'var(--vc-text-muted)' }}
                  >
                    {m.label}
                  </div>
                </div>
              ))}
            </div>

            <p
              className='text-sm leading-relaxed mb-6 text-center'
              style={{ color: 'var(--vc-text-subtle)' }}
            >
              {t(
                'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.',
              )}
            </p>

            <div className='flex flex-wrap items-center justify-center gap-6'>
              {evidenceLink(
                '/kimi-k3-api',
                'kimi_k3_page',
                'View Kimi K3 page',
              )}
              {evidenceLink(
                KIMI_K3_EVIDENCE_STARTER_REPO,
                'starter_repo',
                'View starter & verified evidence',
              )}
              {evidenceLink(
                KIMI_K3_EVIDENCE_URL,
                'verified_json',
                'Verified evidence JSON',
              )}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default EvidenceSection;
