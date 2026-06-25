import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  DeepSeek, Volcengine, Qwen, Zhipu, Moonshot, Minimax,
  Hunyuan, Doubao, Kling, Wenxin, Spark,
} from '@lobehub/icons';
import ScrollReveal from './ScrollReveal';

const { Text } = Typography;

const providers = [
  { icon: DeepSeek, label: 'DeepSeek' },
  { icon: Qwen, label: 'Qwen' },
  { icon: Doubao, label: 'Doubao' },
  { icon: Moonshot, label: 'Moonshot' },
  { icon: Zhipu, label: 'Zhipu' },
  { icon: Minimax, label: 'MiniMax' },
  { icon: Volcengine, label: 'Volcengine' },
  { icon: Hunyuan, label: 'Hunyuan' },
  { icon: Kling, label: 'Kling' },
  { icon: Wenxin, label: 'Wenxin' },
  { icon: Spark, label: 'Spark' },
];

const ProvidersSection = () => {
  const { t } = useTranslation();

  return (
    <section
      className='py-20 overflow-hidden'
      style={{ background: 'var(--vc-section-bg)', borderTop: '1px solid var(--vc-border)' }}
    >
      <ScrollReveal>
        <div className='text-center mb-10'>
          <span
            className='text-sm'
            style={{ color: 'var(--vc-text-subtle)', letterSpacing: '-0.01em' }}
          >
            {t('已接入的大模型供应商')}
          </span>
        </div>
      </ScrollReveal>

      {/* Marquee Container */}
      <div className='relative'>
        {/* Fade edges */}
        <div
          className='absolute left-0 top-0 bottom-0 w-24 z-10'
          style={{ background: 'var(--vc-provider-fade-left)' }}
        />
        <div
          className='absolute right-0 top-0 bottom-0 w-24 z-10'
          style={{ background: 'var(--vc-provider-fade-right)' }}
        />

        {/* Scrolling track */}
        <div className='flex animate-marquee'>
          {[...providers, ...providers, ...providers, ...providers].map((provider, i) => {
            const Icon = provider.icon;
            return (
              <div
                key={`${provider.label}-${i}`}
                className='flex-shrink-0 mx-6 md:mx-8 flex items-center justify-center'
                title={provider.label}
                aria-label={provider.label}
                style={{ width: 48, height: 48, opacity: 0.45, color: 'var(--vc-text-body)' }}
              >
                <Icon size={36} color='currentColor' />
              </div>
            );
          })}
          <div className='flex-shrink-0 mx-6 md:mx-8 flex items-center justify-center'>
            <Text
              className='text-xl md:text-2xl font-bold'
              style={{ color: 'var(--vc-text-subtle)' }}
            >
              11+
            </Text>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProvidersSection;
