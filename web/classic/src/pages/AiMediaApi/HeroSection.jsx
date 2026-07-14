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
import React, { useContext, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../../helpers/analytics';
import { UserContext } from '../../context/User';
import { getAiMediaCtaDestination, AI_MEDIA_CODE_EXAMPLES } from './landing';
import { DESKTOP_NAV_MIN } from '../../constants/breakpoints';

// Whether the viewport is wide enough for the desktop two-column hero
// (matches the nav visibility threshold so nav layout and hero layout
// transition together).
function useIsDesktopHero() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(`(min-width: ${DESKTOP_NAV_MIN}px)`);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return desktop;
}

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

const MODEL_BADGES = [
  'Seedance',
  'Seedream',
  'Doubao TTS',
  'Qwen Image',
  'Text Models',
  '3D Generation',
];

const HeroSection = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isAuthenticated = !!userState?.user;
  const destination = getAiMediaCtaDestination(isAuthenticated);
  const imageExample =
    AI_MEDIA_CODE_EXAMPLES.find((e) => e.id === 'image') || {};
  const isDesktopHero = useIsDesktopHero();

  const handlePrimary = () => {
    trackEvent('get_started_clicked', { location: 'ai_media_hero' });
    navigate(destination);
  };

  return (
    <>
      <section
        id='hero'
        style={{
          maxWidth: 1152,
          margin: '0 auto',
          paddingTop: 96,
          paddingBottom: 64,
          paddingLeft: 24,
          paddingRight: 24,
          position: 'relative',
          // Clip the decorative radial glow so its blur can never widen the
          // document scrollWidth on narrow screens.
          overflow: 'hidden',
        }}
      >
        {/* subtle radial accent — clipped to section bounds so the blur
            glow can never widen the document scrollWidth on narrow screens. */}
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            top: -80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 480,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${C.accentBg}, transparent 70%)`,
            filter: 'blur(40px)',
            pointerEvents: 'none',
            maxWidth: '100vw',
          }}
        />

        <div
          style={{
            display: 'grid',
            // Mobile stacks to a single column; desktop keeps the 7/5 split.
            gridTemplateColumns: isDesktopHero ? 'repeat(12, 1fr)' : '1fr',
            gap: isDesktopHero ? 48 : 32,
            position: 'relative',
          }}
        >
          {/* Left / top: copy + CTAs. min-width:0 + max-width:100% keep the
              text block from outgrowing the viewport on narrow screens. */}
          <div
            style={{
              gridColumn: isDesktopHero ? 'span 7' : 'span 1',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: 16,
              }}
            >
              {t('Built for AI product developers')}
            </motion.p>

            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 54px)',
                fontWeight: 700,
                lineHeight: 1.1,
                color: C.text.strong,
                marginBottom: 20,
              }}
            >
              {t('Access Leading Chinese AI Media Models Through One API')}
            </h1>

            <p
              style={{
                fontSize: 18,
                lineHeight: 1.7,
                color: C.text.muted,
                maxWidth: 560,
                marginBottom: 16,
              }}
            >
              {t(
                'Generate videos, images, speech, text, and 3D assets without integrating every provider separately. Use one API key, unified billing, and developer-friendly endpoints.',
              )}
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: `1px solid ${C.border}`,
                borderRadius: 9999,
                padding: '4px 12px',
                background: C.accentBg,
                color: C.accent,
                fontSize: 14,
                fontWeight: 600,
                marginTop: 8,
                marginBottom: 28,
              }}
            >
              {t('Get $1 in free credits. No credit card required.')}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
              <motion.a
                href='#api'
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  height: 44,
                  padding: '0 22px',
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  color: C.text.strong,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {t('Explore the API')}
              </motion.a>
            </div>
          </div>

          {/* Right / bottom: code preview card. minWidth:0 + maxWidth:100%
              keep the card from outgrowing the viewport on phones; the pre
              scrolls internally instead. */}
          <div
            style={{
              gridColumn: isDesktopHero ? 'span 5' : 'span 1',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <div
              style={{
                background: C.bg.card,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                overflow: 'hidden',
                minWidth: 0,
                maxWidth: '100%',
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
                <span style={{ fontSize: 12, color: C.text.muted }}>
                  POST /v1/images/generations
                </span>
                <span
                  style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}
                >
                  200 OK
                </span>
              </div>
              <pre
                style={{
                  padding: '14px 14px',
                  fontSize: 12,
                  lineHeight: 1.6,
                  overflowX: 'auto',
                  margin: 0,
                  color: C.text.body,
                  // Force long code lines to scroll inside the card instead of
                  // stretching the card (and the page) wider than the viewport.
                  minWidth: 0,
                  maxWidth: '100%',
                  whiteSpace: 'pre',
                }}
              >
                {imageExample.code || ''}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* capability strip */}
      <div
        style={{
          maxWidth: 1152,
          margin: '0 auto',
          padding: '24px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          {MODEL_BADGES.map((label) => (
            <span
              key={label}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 9999,
                padding: '4px 14px',
                fontSize: 14,
                color: C.text.body,
                background: C.bg.card,
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            color: C.text.muted,
            fontSize: 14,
          }}
        >
          {t(
            'Video, image, audio, text, and 3D generation—available with one API key.',
          )}
        </p>
      </div>
    </>
  );
};

export default HeroSection;
