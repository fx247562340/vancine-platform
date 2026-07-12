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
along with this program. If not, not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { AI_MEDIA_CODE_EXAMPLES, getAiMediaDocsUrl } from './landing';

/* ──────────────────── Color constants ──────────────────── */
const C = {
  text: {
    strong: 'var(--vc-text-strong)',
    body: 'var(--vc-text-body)',
    muted: 'var(--vc-text-muted)',
    subtle: 'var(--vc-text-subtle)',
  },
  bg: { card: 'var(--vc-card-bg)' },
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
};

const CodePanel = ({ example }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState('idle');
  const statusTimer = useRef(null);
  const descId = useId();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(example.code);
      setStatus('copied');
    } catch {
      setStatus('error');
    } finally {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus('idle'), 2000);
    }
  }, [example.code]);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  const announce =
    status === 'copied'
      ? t('Code copied')
      : status === 'error'
        ? t('Unable to copy code')
        : '';

  return (
    <div
      style={{
        background: C.bg.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${C.border}`,
          padding: '8px 14px',
        }}
      >
        <a
          href={getAiMediaDocsUrl(example.id)}
          target='_blank'
          rel='noopener noreferrer'
          style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}
        >
          {t('Read API Documentation')}
        </a>
        <button
          type='button'
          onClick={handleCopy}
          aria-label={t('Copy example code to clipboard')}
          aria-describedby={descId}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color:
              status === 'copied'
                ? '#10b981'
                : status === 'error'
                  ? '#ef4444'
                  : C.text.muted,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {status === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          {status === 'copied'
            ? t('Code copied')
            : status === 'error'
              ? t('Unable to copy code')
              : t('Copy code')}
        </button>
      </div>
      <pre
        style={{
          padding: '14px 14px',
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          margin: 0,
          color: C.text.body,
          tabIndex: 0,
        }}
      >
        {example.code}
      </pre>
      <span
        id={descId}
        role='status'
        aria-live='polite'
        className='sr-only'
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
        }}
      >
        {announce}
      </span>
    </div>
  );
};

const ApiExamplesSection = () => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = [];
  const examples = AI_MEDIA_CODE_EXAMPLES;
  const active = examples[activeIndex] || examples[0];

  const focusTab = (idx) => {
    const clamped = (idx + examples.length) % examples.length;
    setActiveIndex(clamped);
    tabRefs[clamped] && tabRefs[clamped].focus();
  };

  const onKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab(idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(examples.length - 1);
    }
  };

  return (
    <section
      id='api'
      style={{
        maxWidth: 1152,
        margin: '0 auto',
        padding: '64px 24px',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 700,
            color: C.text.strong,
            marginBottom: 12,
          }}
        >
          {t('Make Your First Request in Minutes')}
        </h2>
        <p style={{ fontSize: 16, color: C.text.muted, lineHeight: 1.7 }}>
          {t(
            'Use the OpenAI SDK for compatible text workflows or call the documented media endpoints with any HTTP client.',
          )}
        </p>
      </div>

      <div
        style={{
          marginTop: 40,
          maxWidth: 420,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <div
          role='tablist'
          aria-label={t('API examples')}
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: C.accentBg,
          }}
        >
          {examples.map((ex, idx) => {
            const selected = idx === activeIndex;
            return (
              <button
                key={ex.id}
                ref={(el) => (tabRefs[idx] = el)}
                type='button'
                role='tab'
                aria-selected={selected}
                aria-controls={`panel-${ex.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => focusTab(idx)}
                onKeyDown={(e) => onKeyDown(e, idx)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: selected ? C.bg.card : 'transparent',
                  color: selected ? C.text.strong : C.text.muted,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {t(ex.labelKey)}
              </button>
            );
          })}
        </div>

        <div
          id={`panel-${active.id}`}
          role='tabpanel'
          style={{ marginTop: 20 }}
        >
          <CodePanel example={active} />
        </div>
      </div>
    </section>
  );
};

export default ApiExamplesSection;
