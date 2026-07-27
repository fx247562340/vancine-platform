/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../../helpers/analytics';
import { UserContext } from '../../context/User';
import {
  KIMI_K3_API_COMPATIBILITY,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_URL,
  KIMI_K3_MEASURED_USAGE,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_OPENCODE_VERIFICATION,
  KIMI_K3_PORTFOLIO,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing';
import KimiK3Header from './KimiK3Header';

const C = {
  strong: 'var(--vc-text-strong)',
  body: 'var(--vc-text-body)',
  muted: 'var(--vc-text-muted)',
  subtle: 'var(--vc-text-subtle)',
  card: 'var(--vc-card-bg)',
  code: 'var(--vc-code-bg)',
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
};

const API_COMPAT = KIMI_K3_API_COMPATIBILITY;
const AGENT_RUN = KIMI_K3_OPENCODE_VERIFICATION;
const TOOL_CALLS = AGENT_RUN.toolCalls;

function snapshot(selector, attribute) {
  const element = document.head.querySelector(selector);
  return {
    element,
    existed: Boolean(element),
    hadAttribute: element?.hasAttribute(attribute) ?? false,
    value: element?.getAttribute(attribute) ?? '',
  };
}

function setHeadValue(state, tag, identity, identityValue, attribute, value) {
  const element =
    state.element ?? document.head.appendChild(document.createElement(tag));
  element.setAttribute(identity, identityValue);
  element.setAttribute(attribute, value);
  state.element = element;
}

function restore(state, attribute) {
  if (!state.element) return;
  if (!state.existed) state.element.remove();
  else if (state.hadAttribute)
    state.element.setAttribute(attribute, state.value);
  else state.element.removeAttribute(attribute);
}

function CopyBlock({ code, labels }) {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const copy = async () => {
    const result = await copyTextToClipboard(code, navigator?.clipboard);
    setStatus(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 1800);
  };

  const label =
    status === 'copied'
      ? labels.copied
      : status === 'error'
        ? labels.copyError
        : labels.copy;

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        type='button'
        onClick={copy}
        aria-label={labels.copy}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '6px 10px',
          background: C.card,
          color: C.strong,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      <pre
        style={{
          margin: 0,
          padding: '54px 20px 20px',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflowX: 'auto',
          background: C.code,
          color: C.strong,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        <code>{code}</code>
      </pre>
      <span role='status' aria-live='polite' className='sr-only'>
        {status === 'idle' ? '' : label}
      </span>
    </div>
  );
}

function PrimaryLink({ href, children, onClick, inverse = false }) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 42,
        padding: '0 18px',
        borderRadius: 10,
        background: inverse ? '#fff' : C.accent,
        color: inverse ? '#111' : '#fff',
        fontWeight: 650,
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}

function EvidenceCard({ title, badge, facts, note, children }) {
  return (
    <article
      className='flex h-full flex-col rounded-2xl border p-6 text-left'
      style={{ borderColor: C.border }}
    >
      <div className='flex items-center justify-between gap-3'>
        <p
          className='text-sm font-semibold uppercase'
          style={{ color: C.accent }}
        >
          {title}
        </p>
        <span
          className='shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold'
          style={{
            color: C.accent,
            borderColor: C.border,
            background: C.accentBg,
          }}
        >
          {badge}
        </span>
      </div>
      <ul
        className='mt-4 space-y-2.5 text-sm leading-6'
        style={{ color: C.body }}
      >
        {facts.map((fact) => (
          <li key={fact} className='flex gap-2'>
            <span aria-hidden='true' style={{ color: C.accent }}>
              ·
            </span>
            <span className='min-w-0'>{fact}</span>
          </li>
        ))}
      </ul>
      {children}
      {note && (
        <p
          className='mt-4 border-t pt-3 text-xs leading-5'
          style={{ color: C.muted, borderColor: C.border }}
        >
          {note}
        </p>
      )}
    </article>
  );
}

const KimiK3Api = () => {
  const { t, i18n } = useTranslation('kimi');
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const [activeExample, setActiveExample] = useState('curl');
  const isAuthenticated = Boolean(userState?.user);
  const destination = getKimiK3CtaDestination(
    isAuthenticated,
    typeof window === 'undefined' ? '' : window.location.search,
  );
  const activeCode = useMemo(
    () =>
      KIMI_K3_CODE_EXAMPLES.find((item) => item.id === activeExample) ??
      KIMI_K3_CODE_EXAMPLES[0],
    [activeExample],
  );

  // Dynamic fact arrays — interpolated per index from live evidence data.
  const apiCompatibilityFacts = [
    t('evidence.apiCompatibilityFacts.0', { httpStatus: API_COMPAT.httpStatus }),
    t('evidence.apiCompatibilityFacts.1', {
      requestedModel: API_COMPAT.requestedModel,
      responseModel: API_COMPAT.responseModel,
    }),
    t('evidence.apiCompatibilityFacts.2', {
      maxTokens: API_COMPAT.maxTokens,
      finishReason: API_COMPAT.finishReason,
    }),
    t('evidence.apiCompatibilityFacts.3', {
      prompt: API_COMPAT.usage.prompt,
      completion: API_COMPAT.usage.completion,
      total: API_COMPAT.usage.total,
      reasoning: API_COMPAT.usage.reasoning,
    }),
  ];

  const openCodeAgentFacts = [
    t('evidence.openCodeAgentFacts.0', {
      client: AGENT_RUN.client,
      clientVersion: AGENT_RUN.clientVersion,
      model: AGENT_RUN.model,
    }),
    t('evidence.openCodeAgentFacts.1', {
      modelSteps: AGENT_RUN.modelSteps,
      rounds: AGENT_RUN.rounds,
      durationSec: (AGENT_RUN.durationMs / 1000).toFixed(1),
    }),
    t('evidence.openCodeAgentFacts.2', {
      readCompleted: TOOL_CALLS.read.completed,
      editCompleted: TOOL_CALLS.edit.completed,
      bashCompleted: TOOL_CALLS.bash.completed,
    }),
    t('evidence.openCodeAgentFacts.3', {
      sourceModified: AGENT_RUN.sourceModified,
      exitStatus: AGENT_RUN.exitStatus,
    }),
  ];

  // faq.items is a 2D array [question, answer] — returnObjects preserves shape.
  const faqs = t('faq.items', { returnObjects: true }) || [];

  // Flat label bag expected by KimiK3Header + CopyBlock (preserves prior API).
  const labels = {
    quickstartLink: t('hero.quickstartLink'),
    agents: t('agents.title'),
    evidenceNav: t('evidence.nav'),
    docs: t('hero.docs'),
    copy: t('hero.copy'),
    copied: t('hero.copied'),
    copyError: t('hero.copyError'),
  };

  useEffect(() => {
    const meta = getKimiK3Metadata();
    const previousTitle = document.title;
    const states = {
      description: snapshot('meta[name="description"]', 'content'),
      ogTitle: snapshot('meta[property="og:title"]', 'content'),
      ogDescription: snapshot('meta[property="og:description"]', 'content'),
      ogUrl: snapshot('meta[property="og:url"]', 'content'),
      canonical: snapshot('link[rel="canonical"]', 'href'),
    };
    document.title = meta.title;
    setHeadValue(
      states.description,
      'meta',
      'name',
      'description',
      'content',
      meta.description,
    );
    setHeadValue(
      states.ogTitle,
      'meta',
      'property',
      'og:title',
      'content',
      meta.ogTitle,
    );
    setHeadValue(
      states.ogDescription,
      'meta',
      'property',
      'og:description',
      'content',
      meta.ogDescription,
    );
    setHeadValue(
      states.ogUrl,
      'meta',
      'property',
      'og:url',
      'content',
      meta.canonical,
    );
    setHeadValue(
      states.ogUrl,
      'link',
      'rel',
      'canonical',
      'href',
      meta.canonical,
    );

    return () => {
      document.title = previousTitle;
      restore(states.description, 'content');
      restore(states.ogTitle, 'content');
      restore(states.ogDescription, 'content');
      restore(states.ogUrl, 'content');
      restore(states.ogUrl, 'href');
    };
  }, [i18n.language]);

  const go = (location) => (event) => {
    event.preventDefault();
    trackEvent('get_started_clicked', { location });
    navigate(destination);
  };

  return (
    <div
      className='vancine-public-page vancine-k3-api-page'
      style={{
        minHeight: '100vh',
        background: 'var(--vc-page-bg)',
        overflowWrap: 'break-word',
      }}
    >
      <KimiK3Header labels={labels} />

      <main>
        <section className='relative overflow-hidden px-5 py-24 text-center md:py-32'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-3xl'
            style={{ background: C.accentBg }}
          />
          <div className='relative mx-auto max-w-4xl'>
            <p
              className='mb-4 text-sm font-semibold uppercase tracking-wider'
              style={{ color: C.accent }}
            >
              {t('hero.eyebrow')}
            </p>
            <h1
              className='text-4xl font-bold tracking-tight md:text-6xl'
              style={{ color: C.strong }}
            >
              {t('hero.title')}
            </h1>
            <p
              className='mx-auto mt-6 max-w-3xl text-lg leading-8'
              style={{ color: C.body }}
            >
              {t('hero.intro')}
            </p>
            <p
              className='mt-5 inline-flex rounded-full border px-3 py-1 text-sm font-medium'
              style={{
                color: C.accent,
                borderColor: C.border,
                background: C.accentBg,
              }}
            >
              {t('hero.creditDisclaimer')}
            </p>
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <PrimaryLink href={destination} onClick={go('kimi_k3_hero')}>
                {t('hero.start')}
              </PrimaryLink>
              <a
                href='#quickstart'
                className='inline-flex min-h-[42px] items-center justify-center rounded-[10px] border px-[18px] font-semibold no-underline'
                style={{ color: C.strong, borderColor: C.border }}
              >
                {t('hero.quickstartLink')}
              </a>
            </div>
          </div>
        </section>

        <section
          id='quickstart'
          className='border-y px-5 py-20'
          style={{ borderColor: C.border, background: C.card }}
        >
          <div className='mx-auto max-w-5xl'>
            <div className='mb-8 text-center'>
              <h2 className='text-3xl font-bold' style={{ color: C.strong }}>
                {t('hero.quickstart')}
              </h2>
              <p className='mt-3' style={{ color: C.body }}>
                {t('hero.quickstartDesc')}
              </p>
            </div>
            <div
              className='mb-3 flex flex-wrap gap-2'
              role='group'
              aria-label='Quickstart languages'
            >
              {KIMI_K3_CODE_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type='button'
                  aria-pressed={activeExample === example.id}
                  onClick={() => setActiveExample(example.id)}
                  className='rounded-lg border px-3 py-2 text-sm font-semibold'
                  style={{
                    cursor: 'pointer',
                    borderColor: C.border,
                    background:
                      activeExample === example.id ? C.accent : C.card,
                    color: activeExample === example.id ? '#fff' : C.strong,
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <CopyBlock code={activeCode.code} labels={labels} />
            <div className='mt-5 flex flex-wrap justify-between gap-3'>
              <a
                href='https://vancine.com/docs'
                target='_blank'
                rel='noopener noreferrer'
              >
                {t('hero.docs')}
              </a>
              <PrimaryLink
                href={destination}
                onClick={go('kimi_k3_quickstart')}
              >
                {isAuthenticated ? t('hero.playground') : t('hero.start')}
              </PrimaryLink>
            </div>
          </div>
        </section>

        <section id='agents' className='px-5 py-20'>
          <div className='mx-auto grid max-w-6xl gap-8 lg:grid-cols-2'>
            <div>
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                OpenCode
              </p>
              <h2
                className='mt-3 text-3xl font-bold'
                style={{ color: C.strong }}
              >
                {t('agents.title')}
              </h2>
              <p className='mt-4 leading-7' style={{ color: C.body }}>
                {t('agents.desc')}
              </p>
            </div>
            <CopyBlock code={KIMI_K3_OPENCODE_CONFIG} labels={labels} />
            <article
              className='rounded-2xl border p-6 lg:col-span-2'
              style={{ borderColor: C.border }}
            >
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                {t('agents.clineTitle')}
              </p>
              <ol
                className='mt-4 list-decimal space-y-2 pl-5 leading-7'
                style={{ color: C.body }}
              >
                {clineSteps(t).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        <section
          id='evidence'
          className='px-5 py-20'
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <div className='mx-auto max-w-5xl'>
            <div className='text-center'>
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                {t('evidence.eyebrow')}
              </p>
              <h2
                className='mt-3 text-3xl font-bold'
                style={{ color: C.strong }}
              >
                {t('evidence.title')}
              </h2>
              <p
                className='mx-auto mt-4 max-w-2xl leading-7'
                style={{ color: C.body }}
              >
                {t('evidence.desc')}
              </p>
            </div>
            <div className='mt-10 grid gap-4 md:grid-cols-3'>
              <EvidenceCard
                title={t('evidence.apiCompatibilityTitle')}
                badge={t('evidence.badgeVerified')}
                facts={apiCompatibilityFacts}
                note={t('evidence.apiCompatibilityNote')}
              />
              <EvidenceCard
                title={t('evidence.openCodeAgentTitle')}
                badge={t('evidence.badgeVerified')}
                facts={openCodeAgentFacts}
              >
                <a
                  href={KIMI_K3_EVIDENCE_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={() =>
                    trackEvent('developer_resource_clicked', {
                      resource: 'verified_evidence',
                      location: 'evidence',
                    })
                  }
                  className='mt-4 inline-block text-sm font-semibold'
                  style={{ color: C.accent }}
                >
                  {t('evidence.viewVerified')}
                </a>
              </EvidenceCard>
              <EvidenceCard
                title={t('evidence.measuredUsageTitle')}
                badge={t('evidence.measuredUsageBadge')}
                facts={[]}
              >
                <dl className='mt-4 space-y-4'>
                  <div>
                    <dt
                      className='text-xs font-semibold uppercase tracking-wide'
                      style={{ color: C.muted }}
                    >
                      {t('evidence.measuredUsageTokensLabel')}
                    </dt>
                    <dd
                      className='mt-1 text-2xl font-bold'
                      style={{ color: C.strong }}
                    >
                      {KIMI_K3_MEASURED_USAGE.agentTelemetryTokens.toLocaleString(
                        'en-US',
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt
                      className='text-xs font-semibold uppercase tracking-wide'
                      style={{ color: C.muted }}
                    >
                      {t('evidence.measuredUsageAmountLabel')}
                    </dt>
                    <dd
                      className='mt-1 text-2xl font-bold'
                      style={{ color: C.strong }}
                    >
                      ${KIMI_K3_MEASURED_USAGE.amount.toFixed(2)}{' '}
                      <span
                        className='text-sm font-semibold'
                        style={{ color: C.muted }}
                      >
                        {KIMI_K3_MEASURED_USAGE.currency}
                      </span>
                    </dd>
                  </div>
                </dl>
                <p
                  className='mt-4 border-t pt-3 text-xs leading-5'
                  style={{ color: C.muted, borderColor: C.border }}
                >
                  {t('evidence.measuredUsageDisclaimer')}
                </p>
              </EvidenceCard>
            </div>
            <p
              className='mx-auto mt-8 max-w-3xl text-center text-xs leading-5'
              style={{ color: C.muted }}
            >
              {t('evidence.verificationScope')}
            </p>
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <PrimaryLink href={destination} onClick={go('kimi_k3_evidence')}>
                {t('evidence.runPlayground')}
              </PrimaryLink>
              <a
                href={KIMI_K3_EVIDENCE_STARTER_REPO}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() =>
                  trackEvent('developer_resource_clicked', {
                    resource: 'starter_repo',
                    location: 'evidence',
                  })
                }
                className='inline-flex min-h-[42px] items-center justify-center rounded-[10px] border px-[18px] font-semibold no-underline'
                style={{ color: C.strong, borderColor: C.border }}
              >
                {t('evidence.viewStarter')}
              </a>
            </div>
          </div>
        </section>

        <section className='px-5 py-20' style={{ background: C.card }}>
          <div className='mx-auto max-w-6xl text-center'>
            <h2 className='text-3xl font-bold' style={{ color: C.strong }}>
              {t('portfolio.title')}
            </h2>
            <p className='mx-auto mt-3 max-w-2xl' style={{ color: C.body }}>
              {t('portfolio.desc')}
            </p>
            <div className='mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
              {KIMI_K3_PORTFOLIO.map((model) => (
                <div
                  key={model}
                  className='rounded-xl border p-4 font-semibold'
                  style={{ borderColor: C.border, color: C.strong }}
                >
                  {model}
                </div>
              ))}
            </div>
            <a
              className='mt-6 inline-block font-semibold'
              href='https://vancine.com/pricing'
              target='_blank'
              rel='noopener noreferrer'
            >
              {t('hero.pricing')}
            </a>
          </div>
        </section>

        <section className='px-5 py-20'>
          <div className='mx-auto max-w-4xl'>
            <h2
              className='text-center text-3xl font-bold'
              style={{ color: C.strong }}
            >
              {t('faq.title')}
            </h2>
            <div className='mt-8 space-y-3'>
              {faqs.map(([question, answer], idx) => (
                <details
                  key={question || idx}
                  className='rounded-xl border p-5'
                  style={{ borderColor: C.border }}
                >
                  <summary
                    className='cursor-pointer font-semibold'
                    style={{ color: C.strong }}
                  >
                    {question}
                  </summary>
                  <p className='mt-3 leading-7' style={{ color: C.body }}>
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          className='px-5 py-20 text-center'
          style={{ background: C.accent, color: '#fff' }}
        >
          <div className='mx-auto max-w-3xl'>
            <h2 className='text-3xl font-bold'>{t('final.title')}</h2>
            <p className='mt-4 opacity-80'>{t('final.desc')}</p>
            <div className='mt-7'>
              <PrimaryLink
                href={destination}
                onClick={go('kimi_k3_final_cta')}
                inverse
              >
                {t('hero.start')}
              </PrimaryLink>
            </div>
          </div>
        </section>
      </main>

      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px 48px',
          borderTop: `1px solid var(--vc-border)`,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--vc-text-subtle)',
            lineHeight: 2,
          }}
        >
          © {new Date().getFullYear()} Vancine · {t('footer')}
        </p>
      </div>
    </div>
  );
};

// Helper: clineSteps is a nested array — fetch with returnObjects and pass
// straight to the <ol>.
function clineSteps(t) {
  return t('agents.clineSteps', { returnObjects: true }) || [];
}

export default KimiK3Api;