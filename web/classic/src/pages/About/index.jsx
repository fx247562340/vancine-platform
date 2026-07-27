import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { API, showError } from '../../helpers';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import ScrollReveal from '../../components/home/ScrollReveal';

/* ──────────────────── Color constants ──────────────────── */

const C = {
  text: {
    h1: 'var(--vc-text-strong)',
    body: 'var(--vc-text-body)',
    muted: 'var(--vc-text-muted)',
    subtle: 'var(--vc-text-subtle)',
  },
  bg: { light: 'var(--semi-color-fill-0)', card: 'var(--vc-card-bg)' },
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)', accentBg: 'var(--vc-accent-bg)',
  green: 'var(--semi-color-success)', greenBg: 'var(--semi-color-success-light-default)',
  blue: 'var(--semi-color-info)', blueBg: 'var(--semi-color-info-light-default)',
  orange: 'var(--semi-color-warning)', orangeBg: 'var(--semi-color-warning-light-default)',
};

/* ──────────────────── Static visual assets (kept in component, not locale) ──────────────────── */

// Icons for "what" cards. Order MUST match what.items in every locale JSON.
const WHAT_ICONS = ['🔌', '🧭', '💳', '🧰'];

// Colors for "models" tags. Order MUST match models.items in every locale JSON.
const MODEL_THEMES = [
  { color: C.accent, bg: C.accentBg },
  { color: C.green, bg: C.greenBg },
  { color: C.blue, bg: C.blueBg },
  { color: C.orange, bg: C.orangeBg },
  { color: C.accent, bg: C.accentBg },
];

/* ──────────────────── Component ──────────────────── */

const About = () => {
  const { t } = useTranslation('about');
  const currentYear = new Date().getFullYear();

  // Check if admin has configured custom about content
  const [customAbout, setCustomAbout] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchAbout = async () => {
      try {
        const res = await API.get('/api/about');
        const { success, data } = res.data;
        if (success && data && data.trim()) {
          setCustomAbout(data.startsWith('https://') ? data : marked.parse(data));
        }
      } catch {
        // ignore — show default content
      }
      setLoaded(true);
    };
    fetchAbout();
  }, []);

  // If admin set custom content, show it
  if (loaded && customAbout) {
    if (customAbout.startsWith('https://')) {
      return <iframe src={customAbout} style={{ width: '100%', height: '100vh', border: 'none', marginTop: '64px' }} />;
    }
    return (
      <div
        className='vancine-public-page vancine-about-page'
        style={{ marginTop: '64px', padding: '32px', maxWidth: '800px', margin: '96px auto 0', fontSize: '16px', lineHeight: 1.8, color: C.text.body, background: 'var(--vc-page-bg)' }}
      >
        <div dangerouslySetInnerHTML={{ __html: customAbout }} />
      </div>
    );
  }

  const whatItems = t('what.items', { returnObjects: true }) || [];
  const modelItems = t('models.items', { returnObjects: true }) || [];
  const storyParagraphs = t('story.paragraphs', { returnObjects: true }) || [];

  const sectionGap = { marginBottom: '80px' };
  const containerStyle = { maxWidth: '960px', margin: '0 auto', padding: '0 24px' };

  return (
    <div className='vancine-public-page vancine-about-page' style={{ minHeight: '100vh', background: 'var(--vc-page-bg)' }}>
      <div style={{ ...containerStyle, paddingTop: '120px', paddingBottom: '80px' }}>

        {/* ── Hero ── */}
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: '16px' }}
            >
              {t('hero.tag')}
            </motion.p>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700, color: C.text.h1, marginBottom: '20px', lineHeight: 1.2 }}>
              {t('hero.title')}
            </h1>
            <p style={{ fontSize: '18px', color: C.text.muted, maxWidth: '640px', margin: '0 auto', lineHeight: 1.7 }}>
              {t('hero.sub')}
            </p>
          </div>
        </ScrollReveal>

        {/* ── Mission ── */}
        <ScrollReveal delay={0.08}>
          <div style={{ ...sectionGap, textAlign: 'center' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, marginBottom: '16px' }}>
              {t('mission.title')}
            </h2>
            <p style={{ fontSize: '16px', color: C.text.body, maxWidth: '680px', margin: '0 auto', lineHeight: 1.8 }}>
              {t('mission.body')}
            </p>
          </div>
        </ScrollReveal>

        {/* ── What We Offer ── */}
        <div style={sectionGap}>
          <ScrollReveal>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '40px' }}>
              {t('what.title')}
            </h2>
          </ScrollReveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            {whatItems.map((item, i) => (
              <ScrollReveal key={i} delay={0.1 + i * 0.08}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  style={{
                    background: C.bg.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: '16px',
                    padding: '28px 24px',
                    textAlign: 'center',
                    height: '100%',
                  }}
                >
                  <motion.div
                    style={{ fontSize: '36px', marginBottom: '16px' }}
                    whileHover={{ scale: 1.2, rotate: 8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                  >
                    {WHAT_ICONS[i] ?? item.icon ?? '·'}
                  </motion.div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: C.text.h1, marginBottom: '8px' }}>{item.title}</h3>
                  <p style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.6 }}>{item.desc}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* ── Model Categories ── */}
        <div style={sectionGap}>
          <ScrollReveal>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '40px' }}>
              {t('models.title')}
            </h2>
          </ScrollReveal>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'center',
            alignItems: 'stretch',
          }}>
            {modelItems.map((item, i) => {
              const theme = MODEL_THEMES[i] ?? { color: C.accent, bg: C.accentBg };
              return (
                <ScrollReveal key={i} delay={0.05 + i * 0.06}>
                  <motion.div
                    whileHover={{ y: -3, scale: 1.015 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                    style={{
                      background: theme.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: '14px',
                      padding: '20px 22px',
                      width: '280px',
                      minHeight: '118px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      textAlign: 'left',
                    }}
                  >
                    <motion.div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: `${theme.color}18`,
                        color: theme.color,
                        fontSize: '13px',
                        fontWeight: 700,
                        marginBottom: '12px',
                      }}
                      whileHover={{ scale: 1.06 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                    >
                      {item.name}
                    </motion.div>
                    <div style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.6 }}>{item.desc}</div>
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>

        {/* ── Our Story ── */}
        <div style={sectionGap}>
          <ScrollReveal>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '32px' }}>
              {t('story.title')}
            </h2>
          </ScrollReveal>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            {storyParagraphs.map((p, i) => (
              <ScrollReveal key={i} delay={0.06 + i * 0.1}>
                <p style={{ fontSize: '15px', color: C.text.body, lineHeight: 1.8, marginBottom: '20px' }}>{p}</p>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* ── Contact ── */}
        <div style={{ ...sectionGap, textAlign: 'center' }}>
          <ScrollReveal>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, marginBottom: '32px' }}>
              {t('contact.title')}
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
              <motion.a
                href={`mailto:${t('contact.email')}`}
                whileHover={{ y: -3, scale: 1.03 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: C.bg.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 24px',
                  color: C.text.body, textDecoration: 'none', fontSize: '15px',
                }}
              >
                <span style={{ fontSize: '20px' }}>✉️</span> {t('contact.email')}
              </motion.a>
            </div>
          </ScrollReveal>
        </div>

        {/* ── Footer ── */}
        <ScrollReveal>
          <div style={{ textAlign: 'center', paddingTop: '40px', borderTop: `1px solid ${C.border}` }}>
            <p style={{ fontSize: '13px', color: C.text.subtle, lineHeight: 2 }}>
              © {currentYear} Vancine · {t('footer.tagline')}
            </p>
          </div>
        </ScrollReveal>

      </div>
    </div>
  );
};

export default About;