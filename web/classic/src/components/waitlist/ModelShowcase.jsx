import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const modelTypes = [
  {
    icon: '💬',
    title: '大语言模型', titleEn: 'LLM Models',
    models: 'DeepSeek V4 Pro · Qwen 3 · GLM-5 · Doubao Pro · Kimi K2.5 · Hunyuan Pro',
    desc: '中国最强 LLM，统一 OpenAI 协议接入',
    descEn: 'Top Chinese LLMs via unified OpenAI protocol',
    color: '#3B82F6',
  },
  {
    icon: '🎨',
    title: '图片生成', titleEn: 'Image Generation',
    models: 'Seedream 4.0 · Qwen Image · FLUX 1.1 Pro · GPT Image · Jimeng · Imagen 4',
    desc: '文生图、图生图、图片编辑',
    descEn: 'Text-to-image, image editing',
    color: '#EC4899',
  },
  {
    icon: '🎬',
    title: '视频生成', titleEn: 'Video Generation',
    models: 'Seedance 2.0 · Hailuo 2.3 · Kling V2 · Wan 2.5 · Vidu 2.0 · Veo 3.1',
    desc: '文生视频、图生视频',
    descEn: 'Text-to-video and image-to-video',
    color: '#F97316',
  },
  {
    icon: '📦',
    title: '3D 生成', titleEn: '3D Generation',
    models: 'Seed3D 2.0 · Hyper3D Gen2 · Hitem3D 2.0',
    desc: '文本/图片转 3D 模型',
    descEn: 'Text/image to 3D model generation',
    color: '#9B93F2',
  },
  {
    icon: '🎵',
    title: '音频 & 音乐', titleEn: 'Audio & Music',
    models: 'Suno · MiniMax Speech 2.5 · CosyVoice · Fish Audio · GPT Audio',
    desc: '音乐生成、语音合成、声音克隆',
    descEn: 'Music generation, TTS, voice cloning',
    color: '#10B981',
  },
  {
    icon: '🌐',
    title: '国际模型', titleEn: 'Global Models',
    models: 'GPT-5.4 · Claude Opus 4.7 · Gemini 3.1 · Grok 4 · o3-pro',
    desc: '同时支持主流国际模型，一个 API 全覆盖',
    descEn: 'Also supports major global models, one API for all',
    color: '#6366F1',
  },
];

const ModelShowcase = () => {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  return (
    <div style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title heading={2}>{isZh ? '覆盖中国主流 AI 模型' : 'Covering Major Chinese AI Models'}</Title>
          <Text style={{ opacity: 0.6, fontSize: 15 }}>
            {isZh
              ? '一个 API Key，访问所有中国 AI 厂商的最新模型'
              : 'One API Key to access the latest models from all major Chinese AI providers'}
          </Text>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {modelTypes.map((type) => (
            <div key={type.title} style={{
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
                background: `${type.color}15`, fontSize: 22,
              }}>
                {type.icon}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {isZh ? type.title : type.titleEn}
              </div>
              <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8, lineHeight: 1.5 }}>
                {isZh ? type.desc : type.descEn}
              </div>
              <div style={{
                fontSize: 12, opacity: 0.45, lineHeight: 1.6,
                fontFamily: 'monospace',
              }}>
                {type.models}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModelShowcase;
