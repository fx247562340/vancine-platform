import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

// Non-translatable data: model name, Vancine price, and saving badge. Order
// MUST match pricing.comparisons in every locale JSON.
const COMPARISON_DATA = [
  { model: 'DeepSeek V4 Pro', vancine: '$0.30/M tokens', saving: '~30%' },
  { model: 'Qwen 3',         vancine: '$0.40/M tokens', saving: '' },
  { model: 'Kimi K2.5',      vancine: '$0.50/M tokens', saving: '~25%' },
  { model: 'Seedream 4.0',   vancine: '$0.015/张',     saving: '~40%' },
  { model: 'Seedance 2.0',   vancine: '$0.10/段',      saving: '~50%' },
  { model: 'Hailuo 2.3',     vancine: '$0.08/段',      saving: '~40%' },
  { model: 'Seed3D 2.0',     vancine: '$0.10/次',      saving: '' },
];

// Icons for the four selling-point cards. Order MUST match pricing.sellingPoints.
const SELLING_ICONS = ['🌏', '💳', '🔌', '⚡'];

const PricingComparison = () => {
  const { t } = useTranslation('waitlist');
  const rows = t('pricing.comparisons', { returnObjects: true }) || [];
  const sellingPoints = t('pricing.sellingPoints', { returnObjects: true }) || [];

  return (
    <div style={{ padding: '80px 24px', background: 'var(--semi-color-fill-0)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title heading={2}>{t('pricing.title')}</Title>
          <Text style={{ opacity: 0.6, fontSize: 15, display: 'block', marginTop: 8 }}>
            {t('pricing.subtitle')}
          </Text>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--semi-color-border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>{t('pricing.headers.model')}</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, opacity: 0.6 }}>{t('pricing.headers.direct')}</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#9B93F2' }}>{t('pricing.headers.vancine')}</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, opacity: 0.6 }}>{t('pricing.headers.advantage')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const data = COMPARISON_DATA[idx] || {};
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--semi-color-border)' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600 }}>{data.model}</div>
                      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{row.category}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ opacity: 0.7 }}>{row.direct}</div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#9B93F2', fontSize: 15 }}>
                      {data.vancine}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: '#00B464', fontWeight: 500 }}>
                        {row.note}
                      </div>
                      {data.saving && (
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 999, marginTop: 4,
                          fontSize: 12, fontWeight: 500, background: 'rgba(0,180,100,0.1)', color: '#00B464',
                        }}>
                          {t('pricing.cheaper', { saving: data.saving })}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Key selling points */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, marginTop: 48,
        }}>
          {sellingPoints.map((point, idx) => (
            <div key={idx} style={{
              padding: 20, borderRadius: 12, textAlign: 'center',
              border: '1px solid var(--semi-color-border)',
              background: 'var(--semi-color-bg-1)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{SELLING_ICONS[idx] ?? '·'}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{point.title}</div>
              <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.5 }}>{point.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PricingComparison;