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
import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const C = {
  text: {
    strong: 'var(--vc-text-strong)',
    body: 'var(--vc-text-body)',
    muted: 'var(--vc-text-muted)',
  },
  bg: { card: 'var(--vc-card-bg)' },
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
};

const STEPS = [
  {
    titleKey: 'Submit a generation task',
    descKey:
      'Use the documented submit endpoint to start a video generation task.',
    icon: '①',
  },
  {
    titleKey: 'Save the task ID',
    descKey: 'The response includes a unique task_id you save for polling.',
    icon: '②',
  },
  {
    titleKey: 'Poll the status',
    descKey:
      'Poll the documented status endpoint until it returns a terminal state.',
    icon: '③',
  },
  {
    titleKey: 'Retrieve the result',
    descKey:
      'Read the result URL from the terminal response to retrieve the generated video.',
    icon: '④',
  },
];

const WorkflowSection = () => {
  const { t } = useTranslation();
  return (
    <section
      id='workflow'
      style={{ maxWidth: 1152, margin: '0 auto', padding: '64px 24px' }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          textAlign: 'center',
          marginBottom: 40,
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
          {t('From Prompt to Video in One Async Workflow')}
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20,
        }}
      >
        {STEPS.map((step, i) => (
          <motion.div
            key={step.titleKey}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            whileHover={{ y: -4, scale: 1.02 }}
            style={{
              background: C.bg.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: '28px 24px',
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: C.accent,
                marginBottom: 12,
              }}
            >
              {step.icon}
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: C.text.strong,
                marginBottom: 8,
              }}
            >
              {t(step.titleKey)}
            </h3>
            <p style={{ fontSize: 14, color: C.text.muted, lineHeight: 1.6 }}>
              {t(step.descKey)}
            </p>
          </motion.div>
        ))}
      </div>

      <p
        style={{
          textAlign: 'center',
          marginTop: 28,
          color: C.text.muted,
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {t(
          'Current documented examples include Doubao-Seedance-1.5-pro, Doubao-Seedance-2.0-fast, and Doubao-Seedance-2.0. Live documentation and pricing remain authoritative.',
        )}
      </p>
    </section>
  );
};

export default WorkflowSection;
