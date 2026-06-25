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
      title: 'A practical gateway to Chinese AI models',
      sub: 'Vancine helps developers call Chinese text, image, video, audio, and 3D models through one OpenAI-compatible API, with unified billing and routing.',
    },
    mission: {
      title: 'What we are building',
      body: 'We focus on the unglamorous work that makes model access usable: stable API routing, clear pricing, consistent request formats, usable documentation, and support when an integration breaks.',
    },
    what: {
      title: 'What Vancine does',
      items: [
        { icon: '🔌', title: 'Unified API surface', desc: 'Use one OpenAI-compatible endpoint for chat, image, video, audio, and 3D workflows instead of wiring each provider separately.' },
        { icon: '🧭', title: 'Model routing', desc: 'Route requests across configured channels by group, priority, and weight, with failed channels automatically skipped when needed.' },
        { icon: '💳', title: 'Usage-based billing', desc: 'See model pricing and usage in one place. Pay for actual calls instead of managing separate provider balances.' },
        { icon: '🧰', title: 'Developer tooling', desc: 'Docs, examples, request logs, and playground tools help teams test prompts and debug real API calls faster.' },
      ],
    },
    models: {
      title: 'Model coverage',
      items: [
        { name: 'LLM', desc: 'DeepSeek, Qwen, Doubao, Kimi, GLM, MiniMax', color: C.accent, bg: C.accentBg },
        { name: 'Image', desc: 'Doubao Seedream, Qwen Image', color: C.green, bg: C.greenBg },
        { name: 'Video', desc: 'Doubao Seedance and other video routes', color: C.blue, bg: C.blueBg },
        { name: 'Audio', desc: 'Doubao TTS, MiniMax Speech, Qwen Omni', color: C.orange, bg: C.orangeBg },
        { name: '3D', desc: 'Hyper3D, Hitem3D, Doubao Seed3D', color: C.accent, bg: C.accentBg },
      ],
    },
    story: {
      title: 'Why Vancine exists',
      paragraphs: [
        'Chinese AI models are moving quickly, especially in cost-effective text, image, and video generation. For many developers outside China, the hard part is not interest in these models — it is reliable access, documentation, billing, and integration time.',
        'Vancine packages these models behind a familiar API shape so teams can test and switch models without rewriting their application for every provider. The goal is not to hide the model ecosystem, but to make it easier to use in production.',
        'We are still improving the platform with real usage feedback. If a model route, price, document, or response format is confusing, tell us. Those reports directly shape what we fix next.',
      ],
    },
    contact: {
      title: 'Contact',
      email: 'support@vancine.com',
    },
  },
  zh: {
    hero: {
      tag: '关于 Vancine',
      title: '一个实用的中国 AI 模型网关',
      sub: 'Vancine 帮助开发者用一个 OpenAI 兼容 API 调用中国文本、图片、视频、音频和 3D 模型，并统一处理计费与路由。',
    },
    mission: {
      title: '我们在做什么',
      body: '我们专注解决模型接入里最实际的问题：稳定的 API 路由、清晰的价格、统一的请求格式、可用的文档，以及集成出问题时能排查的工具和支持。',
    },
    what: {
      title: 'Vancine 提供什么',
      items: [
        { icon: '🔌', title: '统一 API 接口', desc: '用一个 OpenAI 兼容端点处理对话、图片、视频、音频和 3D 工作流，不必分别对接每个供应商。' },
        { icon: '🧭', title: '模型路由', desc: '按分组、优先级和权重在已配置渠道间路由请求，失败渠道可自动跳过，降低单点故障影响。' },
        { icon: '💳', title: '按量计费', desc: '在一个平台查看模型价格和用量，按实际调用付费，不需要分别管理多个供应商余额。' },
        { icon: '🧰', title: '开发者工具', desc: '文档、示例、请求日志和操练场帮助团队更快测试提示词、排查真实 API 调用。' },
      ],
    },
    models: {
      title: '模型覆盖范围',
      items: [
        { name: 'LLM', desc: 'DeepSeek、Qwen、Doubao、Kimi、GLM、MiniMax', color: C.accent, bg: C.accentBg },
        { name: '图片', desc: 'Doubao Seedream、Qwen Image', color: C.green, bg: C.greenBg },
        { name: '视频', desc: 'Doubao Seedance 等视频路由', color: C.blue, bg: C.blueBg },
        { name: '音频', desc: 'Doubao TTS、MiniMax Speech、Qwen Omni', color: C.orange, bg: C.orangeBg },
        { name: '3D', desc: 'Hyper3D、Hitem3D、Doubao Seed3D', color: C.accent, bg: C.accentBg },
      ],
    },
    story: {
      title: '为什么做 Vancine',
      paragraphs: [
        '中国 AI 模型迭代很快，尤其在高性价比文本、图片和视频生成上。对很多海外开发者来说，真正困难的不是有没有兴趣，而是稳定访问、文档、计费和集成成本。',
        'Vancine 把这些模型整理到熟悉的 API 形态后面，让团队可以测试和切换模型，而不必为了每个供应商重写应用。我们的目标不是隐藏模型生态，而是让它更容易进入生产环境。',
        '平台还在持续改进。如果某个模型路由、价格、文档或响应格式让你困惑，请告诉我们。这些真实反馈会直接决定我们下一步修什么。',
      ],
    },
    contact: {
      title: '联系 Vancine',
      email: 'support@vancine.com',
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
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'center',
            alignItems: 'stretch',
          }}>
            {d.models.items.map((item, i) => (
              <div key={i} style={{
                background: item.bg,
                border: `1px solid ${item.color}22`,
                borderRadius: '14px',
                padding: '20px 22px',
                width: '280px',
                minHeight: '118px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'left',
              }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: `${item.color}18`,
                  color: item.color,
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '12px',
                }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.6 }}>{item.desc}</div>
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
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', paddingTop: '40px', borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: '13px', color: C.text.subtle, lineHeight: 2 }}>
            © {currentYear} Vancine · {isZh ? '让中国 AI 模型更容易被全球开发者使用' : 'Making Chinese AI models easier for global developers to use'}
          </p>
        </div>

      </div>
    </div>
  );
};

export default About;
