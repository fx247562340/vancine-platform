import React from 'react';
import { useTranslation } from 'react-i18next';
import ScrollReveal from './ScrollReveal';

const PricingHighlight = () => {
  const { t } = useTranslation();

  const pricingData = [
    {
      category: 'LLM',
      title: t('文本生成'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      ),
      items: [
        { foreign: { name: 'GPT-5', price: '$1.25', unit: '/M tokens' }, domestic: { name: 'DeepSeek V4 Flash', price: '$0.12', unit: '/M tokens' }, saving: '90%' },
        { foreign: { name: 'Claude Opus 4.8', price: '$15.00', unit: '/M tokens' }, domestic: { name: 'Qwen 3.7 Max', price: '$0.40', unit: '/M tokens' }, saving: '97%' },
        { foreign: { name: 'Gemini 3 Pro', price: '$2.00', unit: '/M tokens' }, domestic: { name: 'Kimi K2.6', price: '$0.42', unit: '/M tokens' }, saving: '79%' },
      ],
    },
    {
      category: 'Video',
      title: t('视频生成'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
        </svg>
      ),
      items: [
        { foreign: { name: 'Runway Gen-4', price: '$0.10', unit: '/sec' }, domestic: { name: 'Doubao Seedance 2.0 Fast', price: '¥0.55', unit: '/call' }, saving: '约 50%+' },
        { foreign: { name: 'Veo 3.1', price: '$0.08', unit: '/sec' }, domestic: { name: 'Doubao Seedance 2.0', price: '¥0.68', unit: '/call' }, saving: '约 40%+' },
      ],
    },
    {
      category: 'Image',
      title: t('图片生成'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
        </svg>
      ),
      items: [
        { foreign: { name: 'GPT Image 1', price: '$0.040', unit: '/image' }, domestic: { name: 'Doubao Seedream 4.5', price: '$0.014', unit: '/image' }, saving: '65%' },
        { foreign: { name: 'Imagen 4', price: '$0.032', unit: '/image' }, domestic: { name: 'Qwen Image 2.0 Pro', price: '$0.012', unit: '/image' }, saving: '63%' },
      ],
    },
  ];

  return (
    <section style={{ padding: '96px 24px' }}>
      <ScrollReveal>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '16px', color: '#00b894' }}>
            Pricing
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, color: '#fff', marginBottom: '16px', lineHeight: 1.2 }}>
            {t('国产模型，全球性价比')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', maxWidth: '560px', margin: '0 auto', fontSize: '15px', lineHeight: 1.7 }}>
            {t('海外最新模型 vs 中国最新模型，按实际调用计费')}
          </p>
        </div>
      </ScrollReveal>

      <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {pricingData.map((group, idx) => (
          <ScrollReveal key={group.category} delay={idx * 0.15}>
            <div style={{
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {/* Category Header */}
              <div style={{
                padding: '14px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {group.icon}
                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                  {group.category}
                </span>
                <span style={{ color: '#fff', fontWeight: 500, marginLeft: '4px' }}>{group.title}</span>
              </div>

              {/* Comparison Rows */}
              {group.items.map((item, i) => (
                <div key={i} style={{
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  flexWrap: 'wrap',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  {/* Overseas Model */}
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{t('海外模型')}</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: '15px' }}>{item.foreign.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginTop: '4px' }}>
                      {item.foreign.price}
                      <span style={{ fontSize: '12px' }}>{item.foreign.unit}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', flexShrink: 0 }}>
                    <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>

                  {/* Chinese Model */}
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: '12px', color: '#00b894', marginBottom: '4px' }}>{t('中国模型')}</div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{item.domestic.name}</div>
                    <div style={{ fontSize: '14px', marginTop: '4px' }}>
                      <span style={{ color: '#fff' }}>{item.domestic.price}</span>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>{item.domestic.unit}</span>
                    </div>
                  </div>

                  {/* Saving Badge */}
                  <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <div style={{
                      padding: '8px 18px',
                      borderRadius: '100px',
                      fontSize: '14px',
                      fontWeight: 700,
                      background: 'rgba(0, 184, 148, 0.12)',
                      color: '#00b894',
                      border: '1px solid rgba(0, 184, 148, 0.2)',
                    }}>
                      {item.saving.endsWith('%') ? `${t('省')} ${item.saving}` : item.saving}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal delay={0.5}>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '32px' }}>
          {t('按量付费，无订阅费用，永不过期')} · {t('价格仅供参考，以实际模型定价为准')}
        </p>
      </ScrollReveal>
    </section>
  );
};

export default PricingHighlight;
