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
import {
  getSeedanceCtaDestination,
  SEEDANCE_CTA_LOCATIONS,
  SEEDANCE_RESOURCE_EVENT,
  SEEDANCE_RESOURCE_VALUES,
  SEEDANCE_RESOURCE_LOCATIONS,
  SEEDANCE_FAQ,
  VANCINE_SEEDANCE_DOCS_URL,
} from './landing';

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

const USE_CASES = [
  {
    titleKey: 'AI video applications',
    descKey:
      'Build short- and long-form video from text or images for apps and platforms.',
    icon: '🎬',
  },
  {
    titleKey: 'creative automation',
    descKey:
      'Automate repetitive creative tasks such as image, audio, and video production.',
    icon: '⚙️',
  },
  {
    titleKey: 'content production workflows',
    descKey:
      'Integrate video generation into media, marketing, and entertainment workflows.',
    icon: '🎞️',
  },
  {
    titleKey: 'developer tools and agents',
    descKey:
      'Power developer tools and agents that chain text, image, video, and audio tasks.',
    icon: '🛠️',
  },
];

const SIMPLIFIES = [
  {
    titleKey: 'one API key',
    descKey: 'Use one key for supported video workflows.',
  },
  {
    titleKey: 'one balance',
    descKey: 'A single balance covers supported usage.',
  },
  {
    titleKey: 'documented async endpoints',
    descKey: 'Submit and poll through documented async endpoints.',
  },
  {
    titleKey: 'centralized usage logs',
    descKey: 'Inspect usage in one place.',
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

const UseCases = ({ t }) => (
  <div style={section}>
    <SectionTitle>{t('Built for Real Video Products')}</SectionTitle>
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
          <span style={{ fontSize: 28 }} aria-hidden='true'>
            {u.icon}
          </span>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: C.text.strong,
              marginTop: 10,
            }}
          >
            {t(u.titleKey)}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: C.text.muted,
              lineHeight: 1.6,
              marginTop: 8,
            }}
          >
            {t(u.descKey)}
          </p>
        </motion.div>
      ))}
    </div>
  </div>
);

const Trust = ({ t }) => (
  <div style={{ ...section, background: 'rgba(255,255,255,0.02)' }}>
    <SectionTitle>{t('What Vancine Simplifies')}</SectionTitle>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 20,
        marginTop: 40,
      }}
    >
      {SIMPLIFIES.map((s) => (
        <motion.div
          key={s.titleKey}
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
            {t(s.titleKey)}
          </h3>
          <p style={{ fontSize: 14, color: C.text.muted, lineHeight: 1.6 }}>
            {t(s.descKey)}
          </p>
        </motion.div>
      ))}
    </div>
    <p
      style={{
        maxWidth: 680,
        margin: '28px auto 0',
        textAlign: 'center',
        fontSize: 14,
        color: C.text.muted,
        lineHeight: 1.7,
      }}
    >
      {t(
        'Model capabilities, input requirements, availability, and safety behavior still follow their documented requirements.',
      )}
    </p>
  </div>
);

const Pricing = ({ t }) => {
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isAuthenticated = !!userState?.user;
  const destination = getSeedanceCtaDestination(isAuthenticated);

  const handlePrimary = () => {
    trackEvent('get_started_clicked', {
      location: SEEDANCE_CTA_LOCATIONS[1],
    });
    navigate(destination);
  };

  return (
    <div id='pricing' style={section}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <SectionTitle>{t('Start Testing Before You Add Funds')}</SectionTitle>
        <p style={{ fontSize: 16, color: C.text.muted, lineHeight: 1.7 }}>
          {t(
            'Create an account with $1 in free credit, use the Playground or API, and review live pricing before adding funds.',
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
          {SEEDANCE_FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.questionKey}
                style={{
                  borderBottom:
                    i < SEEDANCE_FAQ.length - 1
                      ? `1px solid ${C.border}`
                      : 'none',
                }}
              >
                <button
                  type='button'
                  aria-expanded={isOpen}
                  aria-controls={`seedance-faq-panel-${i}`}
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
                  {t(item.questionKey)}
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
                  id={`seedance-faq-panel-${i}`}
                  role='region'
                  hidden={!isOpen}
                  style={{
                    padding: '0 20px 16px',
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: C.text.body,
                  }}
                >
                  {t(item.answerKey)}
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
  const destination = getSeedanceCtaDestination(isAuthenticated);

  const handlePrimary = () => {
    trackEvent('get_started_clicked', {
      location: SEEDANCE_CTA_LOCATIONS[2],
    });
    navigate(destination);
  };

  const handleDocs = () => {
    trackEvent(SEEDANCE_RESOURCE_EVENT, {
      resource: SEEDANCE_RESOURCE_VALUES[0],
      location: SEEDANCE_RESOURCE_LOCATIONS[2],
    });
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
          {t('Make Your First Seedance Request')}
        </h2>
        <p style={{ fontSize: 16, color: C.text.body, lineHeight: 1.7 }}>
          {t(
            'Start with $1 in free credit and use the documented async workflow when you are ready.',
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
            href={VANCINE_SEEDANCE_DOCS_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={handleDocs}
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

const ConversionSections = () => {
  const { t } = useTranslation();
  return (
    <>
      <UseCases t={t} />
      <Trust t={t} />
      <Pricing t={t} />
      <Faq t={t} />
      <FinalCta t={t} />
    </>
  );
};

export default ConversionSections;
