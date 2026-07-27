import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

// Non-translatable data: icon emoji, model list string, and accent color.
// Order MUST match showcase.modelTypes in every locale JSON.
const MODEL_TYPE_DATA = [
  {
    icon: '💬',
    models: 'DeepSeek V4 Pro · Qwen 3 · Doubao Pro · Kimi K2.5 · MiniMax M2.7 · GLM-5',
    color: '#3B82F6',
  },
  {
    icon: '🎨',
    models: 'Seedream 4.0 · Qwen Image · GPT Image · Grok Imagine · Imagen 4 · FLUX',
    color: '#EC4899',
  },
  {
    icon: '🎬',
    models: 'Seedance 2.0 · Hailuo 2.3 · Wan 2.5 · Kling V2 · Veo 3.1 · Sora 2',
    color: '#F97316',
  },
  {
    icon: '📦',
    models: 'Seed3D 2.0 · Hyper3D Gen2 · Hitem3D 2.0',
    color: '#9B93F2',
  },
  {
    icon: '🎵',
    models: 'MiniMax Speech 2.5 · GPT Audio · Doubao TTS · CosyVoice · Fish Audio',
    color: '#10B981',
  },
  {
    icon: '🌐',
    models: 'GPT-5.4 · Claude Opus 4.7 · Gemini 3.1 · Grok 4 · o3-pro',
    color: '#6366F1',
  },
];

const ModelShowcase = () => {
  const { t } = useTranslation('waitlist');
  const types = t('showcase.modelTypes', { returnObjects: true }) || [];

  return (
    <div style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title heading={2}>{t('showcase.title')}</Title>
          <Text style={{ opacity: 0.6, fontSize: 15 }}>
            {t('showcase.subtitle')}
          </Text>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {types.map((type, idx) => {
            const data = MODEL_TYPE_DATA[idx] || {};
            return (
              <div key={idx} style={{
                padding: 24, borderRadius: 12,
                border: '1px solid var(--semi-color-border)',
                background: 'var(--semi-color-bg-1)',
                transition: 'all 0.2s', cursor: 'default',
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{
                  display: 'inline-flex', padding: 10, borderRadius: 8, marginBottom: 12,
                  background: `${data.color}15`, fontSize: 22,
                }}>
                  {data.icon}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                  {type.title}
                </div>
                <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8, lineHeight: 1.5 }}>
                  {type.desc}
                </div>
                <div style={{
                  fontSize: 12, opacity: 0.45, lineHeight: 1.6,
                  fontFamily: 'monospace',
                }}>
                  {data.models}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ModelShowcase;