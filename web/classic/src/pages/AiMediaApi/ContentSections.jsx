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
import React, { useContext, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { trackEvent } from '../../helpers/analytics';
import { UserContext } from '../../context/User';
import { getAiMediaCtaDestination, AI_MEDIA_CTA_LOCATIONS } from './landing';

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

const section = { maxWidth: 1152, margin: '0 auto', padding: '64px 24px' };
const sectionGap = { marginBottom: 80 };
const center = { textAlign: 'center' };

const CATEGORIES = [
  {
    titleKey: 'Video Generation',
    descKey: 'text-to-video and image-to-video async task workflows.',
    icon: '🎬',
  },
  {
    titleKey: 'Image Generation',
    descKey: 'image generation and editing through documented endpoints.',
    icon: '🖼️',
  },
  {
    titleKey: 'Text to Speech',
    descKey: 'binary MP3 output with OpenAI-compatible request shapes.',
    icon: '🔊',
  },
  {
    titleKey: 'Text Models',
    descKey: 'OpenAI-compatible chat and reasoning workflows.',
    icon: '💬',
  },
  {
    titleKey: '3D Generation',
    descKey: 'text- or image-guided async asset generation.',
    icon: '🧊',
  },
];

const USE_CASES = [
  {
    titleKey: 'AI Video Platforms',
    descKey: 'Generate short- and long-form video from text or images.',
  },
  {
    titleKey: 'Creative Automation Tools',
    descKey:
      'Automate image, audio, and video production for creative pipelines.',
  },
  {
    titleKey: 'AI SaaS Products',
    descKey:
      'Add media generation to an existing product through one integration.',
  },
  {
    titleKey: 'Developer Tools and Agents',
    descKey:
      'Build agents and tools that chain text, image, video, and audio tasks.',
  },
];

const COMPARE_ROWS = [
  ['Multiple provider accounts', 'One account'],
  ['Different authentication methods', 'One API key'],
  ['Separate balances', 'Unified billing'],
  ['Provider-specific request formats', 'Documented common endpoints'],
  ['Scattered usage records', 'Centralized usage logs'],
  ['Repeated maintenance', 'One integration layer'],
];

const FAQ_ITEMS = [
  {
    q: 'Is Vancine OpenAI compatible?',
    a: 'For supported text and speech workflows, Vancine offers OpenAI-compatible request shapes. For video, image, and 3D capabilities, use the documented media endpoints.',
  },
  {
    q: 'Which models can I access?',
    a: 'You can use the video, image, speech, text, and 3D models currently supported by the platform. See the live pricing page and API documentation for current availability.',
  },
  {
    q: 'How does video generation work?',
    a: 'Video generation uses an async task workflow: submit a generation request, receive a task ID, then poll the task status and retrieve the result.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. After signing up you receive $1 in free credits with no credit card required to begin testing.',
  },
  {
    q: 'Where can I see pricing?',
    a: 'See the live pricing page. Model pricing can change, so this landing page does not hard-code specific prices.',
  },
  {
    q: 'Can I test models before integrating?',
    a: 'Yes. After signing you can test supported models in the Playground before writing any integration code.',
  },
];

const SectionTitle = ({ children, id }) => (
  <h2
    id={id}
    style={{
      fontSize: 'clamp(24px, 4vw, 36px)',
      fontWeight: 700,
      color: C.text.strong,
      textAlign: 'center',
      marginBottom: 16,
    }}
  >
    {children}
  </h2>
);

const ProblemSolution = ({ t }) => {
  const cards = [
    {
      titleKey: 'One API Key',
      descKey:
        'Connect once and access supported media and text models from one account.',
    },
    {
      titleKey: 'Unified Billing',
      descKey:
        'Manage one balance instead of separate provider accounts and payment methods.',
    },
    {
      titleKey: 'Consistent Developer Experience',
      descKey:
        'Use documented request patterns, centralized usage logs, and async task workflows.',
    },
  ];
  return (
    <div style={section}>
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          textAlign: 'center',
          marginBottom: 40,
        }}
      >
        <SectionTitle>{t('Stop Rebuilding the Same Integration')}</SectionTitle>
        <p style={{ fontSize: 16, color: C.text.muted, lineHeight: 1.7 }}>
          {t(
            'Every model provider comes with its own authentication, request format, billing system, and operational quirks. Vancine gives your product one consistent integration layer.',
          )}
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20,
        }}
      >
        {cards.map((c) => (
          <motion.div
            key={c.titleKey}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{
              background: C.bg.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: '28px 24px',
              height: '100%',
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: C.text.strong,
                marginBottom: 8,
              }}
            >
              {t(c.titleKey)}
            </h3>
            <p style={{ fontSize: 14, color: C.text.muted, lineHeight: 1.6 }}>
              {t(c.descKey)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const ModelCategories = ({ t }) => (
  <div style={{ ...section, background: 'rgba(255,255,255,0.02)' }}>
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        textAlign: 'center',
        marginBottom: 40,
      }}
    >
      <SectionTitle>
        {t('One Integration Across the AI Media Stack')}
      </SectionTitle>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
      }}
    >
      {CATEGORIES.map((c) => (
        <motion.div
          key={c.titleKey}
          whileHover={{ y: -4, scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          style={{
            background: C.bg.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '24px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 28 }} aria-hidden='true'>
            {c.icon}
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text.strong }}>
            {t(c.titleKey)}
          </h3>
          <p style={{ fontSize: 14, color: C.text.muted, lineHeight: 1.6 }}>
            {t(c.descKey)}
          </p>
        </motion.div>
      ))}
    </div>
    <div style={{ textAlign: 'center', marginTop: 32 }}>
      <a
        href='/pricing'
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 40,
          padding: '0 20px',
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          color: C.text.strong,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        {t('Browse Models and Live Pricing')}
      </a>
    </div>
  </div>
);

const UseCases = ({ t }) => (
  <div style={section}>
    <SectionTitle>
      {t('Built for Products That Generate More Than Text')}
    </SectionTitle>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 20,
        marginTop: 40,
      }}
    >
      {USE_CASES.map((u) => (
        <motion.div
          key={u.titleKey}
          whileHover={{ y: -4, scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          style={{
            background: C.bg.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '28px 24px',
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: C.text.strong,
              marginBottom: 8,
            }}
          >
            {t(u.titleKey)}
          </h3>
          <p style={{ fontSize: 14, color: C.text.muted, lineHeight: 1.6 }}>
            {t(u.descKey)}
          </p>
        </motion.div>
      ))}
    </div>
  </div>
);

const Comparison = ({ t }) => (
  <div style={{ ...section, background: 'rgba(255,255,255,0.02)' }}>
    <SectionTitle>{t('One Integration Instead of Many')}</SectionTitle>
    <div
      style={{
        maxWidth: 720,
        margin: '40px auto 0',
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
        background: C.bg.card,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: C.text.muted,
          }}
        >
          {t('Direct integrations')}
        </div>
        <div
          style={{
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: C.text.muted,
            borderLeft: `1px solid ${C.border}`,
          }}
        >
          {t('Vancine')}
        </div>
      </div>
      {COMPARE_ROWS.map(([left, right], i) => (
        <div
          key={left}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
          }}
        >
          <div
            style={{ padding: '12px 16px', fontSize: 14, color: C.text.body }}
          >
            {t(left)}
          </div>
          <div
            style={{
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              color: C.text.strong,
              borderLeft: `1px solid ${C.border}`,
            }}
          >
            {t(right)}
          </div>
        </div>
      ))}
    </div>
    <p
      style={{
        maxWidth: 640,
        margin: '20px auto 0',
        textAlign: 'center',
        fontSize: 14,
        color: C.text.muted,
        lineHeight: 1.7,
      }}
    >
      {t(
        'Model-specific capabilities still follow their documented requirements. Vancine simplifies access without hiding important model differences.',
      )}
    </p>
  </div>
);

const Pricing = ({ t }) => {
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isAuthenticated = !!userState?.user;
  const destination = getAiMediaCtaDestination(isAuthenticated);
  const facts = [
    '$1 free credit',
    'No credit card required',
    'Public model pricing',
    'Pay only for actual usage',
  ];

  const handlePrimary = () => {
    trackEvent('get_started_clicked', { location: AI_MEDIA_CTA_LOCATIONS[1] });
    navigate(destination);
  };

  return (
    <div id='pricing' style={section}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <SectionTitle>{t('Start Building Before You Commit')}</SectionTitle>
        <p style={{ fontSize: 16, color: C.text.muted, lineHeight: 1.7 }}>
          {t(
            'Create an account and receive $1 in free credits. Explore supported models, test requests in the Playground, and review public pricing before adding funds.',
          )}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 24,
            marginTop: 24,
          }}
        >
          {facts.map((f) => (
            <span
              key={f}
              style={{ fontSize: 14, fontWeight: 600, color: C.text.body }}
            >
              {t(f)}
            </span>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 28,
            flexWrap: 'wrap',
          }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePrimary}
            style={{
              height: 44,
              padding: '0 22px',
              borderRadius: 10,
              border: 'none',
              background: C.accent,
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {t('Start Free')}
          </motion.button>
          <a
            href='/pricing'
            style={{
              height: 44,
              padding: '0 22px',
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              color: C.text.strong,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {t('View Live Pricing')}
          </a>
        </div>
      </div>
    </div>
  );
};

const Faq = ({ t }) => {
  const [open, setOpen] = useState(null);
  return (
    <div id='faq' style={{ ...section, background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
            background: C.bg.card,
          }}
        >
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                style={{
                  borderBottom:
                    i < FAQ_ITEMS.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <button
                  type='button'
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: C.text.strong,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  {t(item.q)}
                  <ChevronDown
                    size={18}
                    style={{
                      color: C.text.muted,
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}
                  />
                </button>
                <div
                  id={`faq-panel-${i}`}
                  role='region'
                  hidden={!isOpen}
                  style={{
                    padding: '0 20px 16px',
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: C.text.body,
                  }}
                >
                  {t(item.a)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const FinalCta = ({ t }) => {
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isAuthenticated = !!userState?.user;
  const destination = getAiMediaCtaDestination(isAuthenticated);

  const handlePrimary = () => {
    trackEvent('get_started_clicked', { location: AI_MEDIA_CTA_LOCATIONS[2] });
    navigate(destination);
  };

  return (
    <div style={{ ...section, paddingTop: 80, paddingBottom: 96 }}>
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          textAlign: 'center',
          borderRadius: 24,
          padding: '48px 32px',
          background: `linear-gradient(135deg, ${C.accentBg}, transparent)`,
          border: `1px solid ${C.border}`,
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 700,
            color: C.text.strong,
            marginBottom: 12,
          }}
        >
          {t('Build Your First AI Media Request Today')}
        </h2>
        <p style={{ fontSize: 16, color: C.text.body, lineHeight: 1.7 }}>
          {t(
            'Create your account, claim $1 in free credits, and test supported models in the Playground.',
          )}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 28,
            flexWrap: 'wrap',
          }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePrimary}
            style={{
              height: 44,
              padding: '0 22px',
              borderRadius: 10,
              border: 'none',
              background: C.accent,
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {t('Start Free with $1 Credit')}
          </motion.button>
          <a
            href='https://vancine.com/docs'
            target='_blank'
            rel='noopener noreferrer'
            style={{
              height: 44,
              padding: '0 22px',
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              color: C.text.strong,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {t('View Documentation')}
          </a>
        </div>
      </div>
    </div>
  );
};

const ContentSections = () => {
  const { t } = useTranslation();
  return (
    <>
      <ProblemSolution t={t} />
      <ModelCategories t={t} />
      <UseCases t={t} />
      <Comparison t={t} />
      <Pricing t={t} />
      <Faq t={t} />
      <FinalCta t={t} />
    </>
  );
};

export default ContentSections;
