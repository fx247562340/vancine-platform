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
import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../../helpers/analytics';
import { UserContext } from '../../context/User';
import { getSeedanceCtaDestination, SEEDANCE_CTA_LOCATIONS } from './landing';

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

const HeroSection = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isAuthenticated = !!userState?.user;
  const destination = getSeedanceCtaDestination(isAuthenticated);

  const handlePrimary = () => {
    trackEvent('get_started_clicked', {
      location: SEEDANCE_CTA_LOCATIONS[0],
    });
    navigate(destination);
  };

  return (
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
        // Clip the decorative radial glow so it cannot horizontally
        // overflow the viewport on narrow screens. The glow is
        // aria-hidden and pointer-events:none, so clipping is safe.
        overflow: 'hidden',
      }}
    >
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
        }}
      />

      <div style={{ position: 'relative', textAlign: 'center' }}>
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
          {t('Seedance API for developers')}
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
          {t('Generate Seedance Videos with One API')}
        </h1>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.7,
            color: C.text.muted,
            maxWidth: 720,
            marginBottom: 16,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {t(
            'Submit supported text-to-video and image-to-video tasks, poll their status, and retrieve results with one Vancine API key.',
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
          {t('$1 free credit. No credit card required.')}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
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
          <motion.a
            href='#workflow'
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
            {t('View the Async Workflow')}
          </motion.a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
