import React, { useEffect, useState } from 'react';
import { API, showError } from '../../helpers';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';

/* ──────────────────── Color constants ──────────────────── */

const C = {
  text: { h1: '#f0f0f0', body: '#d1d5db', muted: '#9ca3af', subtle: '#6b7280' },
  bg: { light: '#141414', card: '#1a1a1a' },
  border: '#2a2a2a',
  accent: '#a78bfa', accentBg: 'rgba(167,139,250,0.1)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.1)',
  blue: '#60a5fa', blueBg: 'rgba(96,165,250,0.1)',
  orange: '#fbbf24', orangeBg: 'rgba(251,191,36,0.1)',
};

/* ──────────────────── Data ──────────────────── */

const L = {
  en: {
    hero: {
      tag: 'About Vancine',
      title: 'One API for All AI Models',
      sub: 'We provide developers worldwide with a unified, cost-effective gateway to the best Chinese AI models — text, image, video, audio, and 3D.',
    },
    mission: {
      title: 'Our Mission',
      body: 'Make cutting-edge AI accessible to every developer, regardless of geography or budget. We bridge the gap between world-class Chinese AI models and global developers through a single, OpenAI-compatible API.',
    },
    what: {
      title: 'What We Offer',
      items: [
        { icon: '🔌', title: 'Unified API', desc: 'One endpoint for text, image, video, audio, and 3D generation. OpenAI-compatible format — switch in minutes.' },
        { icon: '💰', title: 'Best Pricing', desc: 'Access Chinese AI models at 20-50% the cost of international alternatives. Pay-as-you-go, no subscriptions.' },
        { icon: '⚡', title: 'Low Latency', desc: 'Optimized routing and edge infrastructure for fast response times across Asia, North America, and Europe.' },
        { icon: '🔒', title: 'Secure & Private', desc: 'Encrypted API keys, usage analytics, and team management built in. Your data stays yours.' },
      ],
    },
    models: {
      title: 'Supported Model Categories',
      items: [
        { name: 'LLM', desc: 'DeepSeek, Qwen, Doubao, GLM and more', color: C.accent, bg: C.accentBg },
        { name: 'Image', desc: 'Seedream, FLUX, Kolors, Ideogram', color: C.green, bg: C.greenBg },
        { name: 'Video', desc: 'Wan, Kling, Seedance, Hailuo', color: C.blue, bg: C.blueBg },
        { name: 'Audio', desc: 'Doubao TTS, Whisper STT', color: C.orange, bg: C.orangeBg },
        { name: '3D', desc: 'Hitem3D, Hyper3D, Trellis', color: C.accent, bg: C.accentBg },
      ],
    },
    story: {
      title: 'Our Story',
      paragraphs: [
        'Vancine was founded in 2025 by a solo developer who saw a simple problem: Chinese AI models were world-class, but nearly impossible for international developers to access.',
        'We built a unified API gateway that normalizes dozens of different model APIs into a single, OpenAI-compatible interface. No more juggling multiple providers, managing separate billing, or dealing with language barriers.',
        'Vancine is still in its early stages. We are actively building and improving based on real user feedback. If you encounter any issues, please reach out — we respond to every message.',
      ],
    },
    contact: {
      title: 'Get in Touch',
      email: 'support@vancine.com',
      github: 'github.com/fx247562340/vancine-platform',
    },
    legal: {
      basedOn: 'Based on',
      licensed: 'Licensed under',
    },
  },
  zh: {
    hero: {
      tag: '关于 Vancine',
      title: '一个 API 接入所有 AI 模型',
      sub: '为全球开发者提供统一、高性价比的中国 AI 模型网关 — 文本、图片、视频、音频和 3D。',
    },
    mission: {
      title: '我们的使命',
      body: '让每个开发者都能用上前沿 AI，不受地域和预算限制。我们通过一个 OpenAI 兼容的 API，架起中国顶级 AI 模型与全球开发者之间的桥梁。',
    },
    what: {
      title: '我们提供什么',
      items: [
        { icon: '🔌', title: '统一 API', desc: '一个端点覆盖文本、图片、视频、音频和 3D 生成。OpenAI 兼容格式，分钟级切换。' },
        { icon: '💰', title: '最优价格', desc: '以国际模型 20-50% 的价格使用中国 AI 模型。按量付费，无订阅。' },
        { icon: '⚡', title: '低延迟', desc: '优化路由和边缘基础设施，覆盖亚洲、北美和欧洲的快速响应。' },
        { icon: '🔒', title: '安全私密', desc: '加密 API Key、用量分析和团队管理。您的数据始终属于您。' },
      ],
    },
    models: {
      title: '支持的模型类别',
      items: [
        { name: 'LLM', desc: 'DeepSeek、Qwen、Doubao、GLM 等', color: C.accent, bg: C.accentBg },
        { name: '图片', desc: 'Seedream、FLUX、Kolors、Ideogram', color: C.green, bg: C.greenBg },
        { name: '视频', desc: 'Wan、Kling、Seedance、Hailuo', color: C.blue, bg: C.blueBg },
        { name: '音频', desc: 'Doubao TTS、Whisper STT', color: C.orange, bg: C.orangeBg },
        { name: '3D', desc: 'Hitem3D、Hyper3D、Trellis', color: C.accent, bg: C.accentBg },
      ],
    },
    story: {
      title: '我们的故事',
      paragraphs: [
        'Vancine 创立于 2025 年，由一位独立开发者发起。我们发现一个简单的问题：中国的 AI 模型已达世界水平，但国际开发者几乎无法使用。',
        '我们构建了一个统一的 API 网关，将数十种不同的模型 API 标准化为一个 OpenAI 兼容的接口。不再需要对接多个供应商、管理多个账单或克服语言障碍。',
        'Vancine 仍处于早期阶段。我们正在根据真实用户反馈持续改进。如果您遇到任何问题，请联系我们 — 我们会回复每一条消息。',
      ],
    },
    contact: {
      title: '联系我们',
      email: 'support@vancine.com',
      github: 'github.com/fx247562340/vancine-platform',
    },
    legal: {
      basedOn: '基于',
      licensed: '授权许可',
    },
  },
};

/* ──────────────────── Component ──────────────────── */

const About = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const d = L[isZh ? 'zh' : 'en'];
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
      <div style={{ marginTop: '64px', padding: '32px', maxWidth: '800px', margin: '96px auto 0', fontSize: '16px', lineHeight: 1.8, color: C.text.body }}>
        <div dangerouslySetInnerHTML={{ __html: customAbout }} />
      </div>
    );
  }

  const sectionGap = { marginBottom: '80px' };
  const containerStyle = { maxWidth: '960px', margin: '0 auto', padding: '0 24px' };

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ ...containerStyle, paddingTop: '120px', paddingBottom: '80px' }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: '80px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: '16px' }}>
            {d.hero.tag}
          </p>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700, color: C.text.h1, marginBottom: '20px', lineHeight: 1.2 }}>
            {d.hero.title}
          </h1>
          <p style={{ fontSize: '18px', color: C.text.muted, maxWidth: '640px', margin: '0 auto', lineHeight: 1.7 }}>
            {d.hero.sub}
          </p>
        </div>

        {/* ── Mission ── */}
        <div style={{ ...sectionGap, textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, marginBottom: '16px' }}>
            {d.mission.title}
          </h2>
          <p style={{ fontSize: '16px', color: C.text.body, maxWidth: '680px', margin: '0 auto', lineHeight: 1.8 }}>
            {d.mission.body}
          </p>
        </div>

        {/* ── What We Offer ── */}
        <div style={sectionGap}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '40px' }}>
            {d.what.title}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            {d.what.items.map((item, i) => (
              <div key={i} style={{
                background: C.bg.card,
                border: `1px solid ${C.border}`,
                borderRadius: '16px',
                padding: '28px 24px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '36px', marginBottom: '16px' }}>{item.icon}</div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: C.text.h1, marginBottom: '8px' }}>{item.title}</h3>
                <p style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Model Categories ── */}
        <div style={sectionGap}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '40px' }}>
            {d.models.title}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
            {d.models.items.map((item, i) => (
              <div key={i} style={{
                background: item.bg,
                border: `1px solid ${item.color}22`,
                borderRadius: '12px',
                padding: '20px 28px',
                minWidth: '160px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: item.color, marginBottom: '6px' }}>{item.name}</div>
                <div style={{ fontSize: '13px', color: C.text.muted }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Our Story ── */}
        <div style={sectionGap}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, textAlign: 'center', marginBottom: '32px' }}>
            {d.story.title}
          </h2>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            {d.story.paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: '15px', color: C.text.body, lineHeight: 1.8, marginBottom: '20px' }}>{p}</p>
            ))}
          </div>
        </div>

        {/* ── Contact ── */}
        <div style={{ ...sectionGap, textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: C.text.h1, marginBottom: '32px' }}>
            {d.contact.title}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <a href={`mailto:${d.contact.email}`} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: C.bg.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 24px',
              color: C.text.body, textDecoration: 'none', fontSize: '15px',
            }}>
              <span style={{ fontSize: '20px' }}>✉️</span> {d.contact.email}
            </a>
            <a href={`https://${d.contact.github}`} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: C.bg.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 24px',
              color: C.text.body, textDecoration: 'none', fontSize: '15px',
            }}>
              <span style={{ fontSize: '20px' }}>🐙</span> GitHub
            </a>
          </div>
        </div>

        {/* ── Legal ── */}
        <div style={{ textAlign: 'center', paddingTop: '40px', borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: '13px', color: C.text.subtle, lineHeight: 2 }}>
            © {currentYear} Vancine. {d.legal.basedOn}{' '}
            <a href="https://github.com/songquanpeng/one-api/releases/tag/v0.5.4" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>
              One API v0.5.4
            </a>{' '}
            © 2023 JustSong. {d.legal.licensed}{' '}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>
              AGPL v3.0
            </a>.
          </p>
        </div>

      </div>
    </div>
  );
};

export default About;
