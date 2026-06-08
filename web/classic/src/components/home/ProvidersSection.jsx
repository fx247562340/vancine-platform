import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  Moonshot, OpenAI, XAI, Zhipu, Volcengine, Cohere,
  Claude, Gemini, Suno, Minimax, Wenxin, Spark,
  Qingyan, DeepSeek, Qwen, Midjourney, Grok,
  AzureAI, Hunyuan, Xinference,
} from '@lobehub/icons';
import ScrollReveal from './ScrollReveal';

const { Text } = Typography;

const providers = [
  Moonshot, OpenAI, XAI, Zhipu, Volcengine, Cohere,
  Claude, Gemini, Suno, Minimax, Wenxin, Spark,
  Qingyan, DeepSeek, Qwen, Midjourney, Grok,
  AzureAI, Hunyuan, Xinference,
];

const ProvidersSection = () => {
  const { t } = useTranslation();

  return (
    <section
      className='py-20 overflow-hidden'
      style={{ background: '#090909', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <ScrollReveal>
        <div className='text-center mb-10'>
          <span
            className='text-sm'
            style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '-0.01em' }}
          >
            {t('支持众多的大模型供应商')}
          </span>
        </div>
      </ScrollReveal>

      {/* Marquee Container */}
      <div className='relative'>
        {/* Fade edges */}
        <div
          className='absolute left-0 top-0 bottom-0 w-24 z-10'
          style={{ background: 'linear-gradient(to right, #090909, transparent)' }}
        />
        <div
          className='absolute right-0 top-0 bottom-0 w-24 z-10'
          style={{ background: 'linear-gradient(to left, #090909, transparent)' }}
        />

        {/* Scrolling track */}
        <div className='flex animate-marquee'>
          {[...providers, ...providers].map((Icon, i) => (
            <div
              key={i}
              className='flex-shrink-0 mx-6 md:mx-8 flex items-center justify-center'
              style={{ width: 48, height: 48, opacity: 0.3 }}
            >
              <Icon size={36} color='#fff' />
            </div>
          ))}
          <div className='flex-shrink-0 mx-6 md:mx-8 flex items-center justify-center'>
            <Text
              className='text-xl md:text-2xl font-bold'
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              30+
            </Text>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProvidersSection;
