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
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../../helpers/analytics';
import { UserContext } from '../../context/User';
import {
  KIMI_K3_API_COMPATIBILITY,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CREDIT_DISCLAIMER,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_EVIDENCE_URL,
  KIMI_K3_MEASURED_USAGE,
  KIMI_K3_MEASURED_USAGE_DISCLAIMER,
  KIMI_K3_OPENCODE_CONFIG,
  KIMI_K3_OPENCODE_VERIFICATION,
  KIMI_K3_PORTFOLIO,
  KIMI_K3_VERIFICATION_SCOPE,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing';
import KimiK3Header from './KimiK3Header';

const C = {
  strong: 'var(--vc-text-strong)',
  body: 'var(--vc-text-body)',
  muted: 'var(--vc-text-muted)',
  subtle: 'var(--vc-text-subtle)',
  card: 'var(--vc-card-bg)',
  code: 'var(--vc-code-bg)',
  border: 'var(--vc-border)',
  accent: 'var(--vc-accent)',
  accentBg: 'var(--vc-accent-bg)',
};

const API_COMPAT = KIMI_K3_API_COMPATIBILITY;
const AGENT_RUN = KIMI_K3_OPENCODE_VERIFICATION;
const TOOL_CALLS = AGENT_RUN.toolCalls;

const TEXT = {
  en: {
    eyebrow: 'China frontier AI, one developer path',
    title: 'Kimi K3 API for Coding Agents',
    intro:
      'Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one Vancine API key.',
    start: 'Start free',
    playground: 'Go to Playground',
    quickstartLink: 'View quickstart',
    quickstart: 'OpenAI-compatible quickstart',
    quickstartDesc:
      'Send your first Kimi K3 chat completion with an environment variable, not a pasted secret.',
    copy: 'Copy',
    copied: 'Copied',
    copyError: 'Unable to copy',
    docs: 'Documentation',
    pricing: 'Live pricing',
    agents: 'Coding agent setup',
    agentsDesc:
      'Use the OpenAI-compatible provider, the Vancine base URL, and an environment-backed key.',
    clineTitle: 'Cline and Roo Code',
    clineSteps: [
      'Choose OpenAI Compatible as the API provider.',
      'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.',
      'Select kimi-k3 as the model ID.',
    ],
    evidenceNav: 'Evidence',
    evidenceEyebrow: 'Live verification',
    evidenceTitle: 'Verified against the real Kimi K3',
    evidenceDesc:
      'Two live checks against the real kimi-k3 model through the Vancine endpoint: an OpenAI-compatible API probe and one completed OpenCode coding-agent run.',
    badgeVerified: 'Verified',
    apiCompatibilityTitle: 'API compatibility',
    apiCompatibilityFacts: [
      `temperature:0 request returned HTTP ${API_COMPAT.httpStatus}`,
      `Requested model ${API_COMPAT.requestedModel}, response model ${API_COMPAT.responseModel}`,
      `Probe budget: max_tokens ${API_COMPAT.maxTokens} · finish_reason ${API_COMPAT.finishReason}`,
      `Usage: prompt ${API_COMPAT.usage.prompt} · completion ${API_COMPAT.usage.completion} · total ${API_COMPAT.usage.total} · reasoning ${API_COMPAT.usage.reasoning}`,
    ],
    apiCompatibilityNote:
      'Visible content from this 16-token probe is inconclusive: reasoning consumed most of the token budget. This is a small compatibility probe, not a content-generation failure.',
    openCodeAgentTitle: 'OpenCode Agent',
    openCodeAgentFacts: [
      `${AGENT_RUN.client} v${AGENT_RUN.clientVersion} against the real ${AGENT_RUN.model}`,
      `${AGENT_RUN.modelSteps} completed model steps · ${AGENT_RUN.rounds} round · ${(AGENT_RUN.durationMs / 1000).toFixed(1)} s`,
      `Tool calls: read ${TOOL_CALLS.read.completed}, edit ${TOOL_CALLS.edit.completed}, bash ${TOOL_CALLS.bash.completed} — all completed, 0 failed`,
      `Tests passed · ${AGENT_RUN.sourceModified} modified · test file untouched · exit ${AGENT_RUN.exitStatus}`,
    ],
    evidenceViewVerified: 'View verified evidence',
    measuredUsageTitle: 'Measured usage',
    measuredUsageBadge: 'One controlled run',
    measuredUsageTokensLabel: 'Agent telemetry tokens',
    measuredUsageAmountLabel: 'Vancine measured usage',
    evidenceRunPlayground: 'Run K3 in Playground',
    evidenceViewStarter: 'View starter repository',
    portfolio: 'One key, a focused China AI portfolio',
    portfolioDesc:
      'Switch models as your task changes. Features, availability, and pricing are model-specific.',
    faq: 'Frequently asked questions',
    faqs: [
      [
        'Where can I confirm Kimi K3 availability and pricing?',
        'Check live pricing and your authenticated model list. Availability, pricing, and limits can change, and those live sources are authoritative.',
      ],
      ['What does the free credit include?', KIMI_K3_CREDIT_DISCLAIMER],
      [
        'Which developer tools work with this API?',
        'OpenCode, Cline, Roo Code, and tools that support OpenAI-compatible chat completions can use the same base URL and API key.',
      ],
    ],
    finalTitle: 'Put Kimi K3 in your coding agent today',
    finalDesc:
      'Start with a documented OpenAI-compatible request, then choose the model that fits the work.',
    footer: 'Access leading Chinese AI models through one developer API',
  },
  zh: {
    eyebrow: '中国前沿 AI，一个开发者入口',
    title: '面向编程智能体的 Kimi K3 API',
    intro:
      '使用一个 Vancine API 密钥，将 OpenCode、Cline、Roo Code 和兼容 OpenAI 的工具接入 Kimi K3。',
    start: '免费开始',
    playground: '前往体验中心',
    quickstartLink: '查看快速开始',
    quickstart: '兼容 OpenAI 的快速开始',
    quickstartDesc:
      '通过环境变量发送第一条 Kimi K3 对话请求，不要直接粘贴密钥。',
    copy: '复制',
    copied: '已复制',
    copyError: '复制失败',
    docs: '开发文档',
    pricing: '实时定价',
    agents: '编程智能体配置',
    agentsDesc:
      '使用兼容 OpenAI 的 Provider、Vancine Base URL 和环境变量中的密钥。',
    clineTitle: 'Cline 与 Roo Code',
    clineSteps: [
      '选择 OpenAI Compatible 作为 API Provider。',
      '将 Base URL 设为 https://vancine.com/v1，并使用 VANCINE_API_KEY。',
      '选择 kimi-k3 作为模型 ID。',
    ],
    evidenceNav: '兼容性验证',
    evidenceEyebrow: '实测验证',
    evidenceTitle: '真实 Kimi K3 实测验证',
    evidenceDesc:
      '通过 Vancine 端点对真实 kimi-k3 模型完成的两项实测：OpenAI 兼容 API 探测，以及一次完整完成的 OpenCode 编程 Agent 运行。',
    badgeVerified: '已验证',
    apiCompatibilityTitle: 'API 兼容性',
    apiCompatibilityFacts: [
      `temperature:0 请求返回 HTTP ${API_COMPAT.httpStatus}`,
      `请求模型 ${API_COMPAT.requestedModel}，响应模型 ${API_COMPAT.responseModel}`,
      `探测预算：max_tokens ${API_COMPAT.maxTokens} · finish_reason ${API_COMPAT.finishReason}`,
      `用量：prompt ${API_COMPAT.usage.prompt} · completion ${API_COMPAT.usage.completion} · total ${API_COMPAT.usage.total} · reasoning ${API_COMPAT.usage.reasoning}`,
    ],
    apiCompatibilityNote:
      '该 16 token 探测的可见内容无法定论：推理过程占用了大部分 Token 预算。这是一个小型兼容性探测，并非内容生成失败。',
    openCodeAgentTitle: 'OpenCode 编程 Agent',
    openCodeAgentFacts: [
      `${AGENT_RUN.client} v${AGENT_RUN.clientVersion}，调用真实 ${AGENT_RUN.model}`,
      `${AGENT_RUN.modelSteps} 个已完成模型步骤 · ${AGENT_RUN.rounds} 轮 · ${(AGENT_RUN.durationMs / 1000).toFixed(1)} 秒`,
      `工具调用：read ${TOOL_CALLS.read.completed} 次、edit ${TOOL_CALLS.edit.completed} 次、bash ${TOOL_CALLS.bash.completed} 次，全部完成，0 次失败`,
      `测试通过 · ${AGENT_RUN.sourceModified} 已修改 · 测试文件未改动 · exit ${AGENT_RUN.exitStatus}`,
    ],
    evidenceViewVerified: '查看验证证据',
    measuredUsageTitle: '实测用量',
    measuredUsageBadge: '单次受控运行',
    measuredUsageTokensLabel: 'Agent 遥测 Token',
    measuredUsageAmountLabel: 'Vancine 实测用量',
    evidenceRunPlayground: '在操练场运行 K3',
    evidenceViewStarter: '查看 Starter 仓库',
    portfolio: '一个密钥，连接精选中国 AI 模型',
    portfolioDesc: '按任务切换模型；能力、可用性与价格均以实时页面为准。',
    faq: '常见问题',
    faqs: [
      [
        '在哪里确认 Kimi K3 的可用性与价格？',
        '请查看实时定价页和登录后的模型列表。可用性、价格和限制可能变化，以实时信息为准。',
      ],
      [
        '免费额度包含什么？',
        '新账号有 1 美元免费额度，无需信用卡。实际用量取决于模型和请求。',
      ],
      [
        '哪些开发工具可以使用？',
        'OpenCode、Cline、Roo Code 以及支持 OpenAI Chat Completions 的工具均可使用相同 Base URL 和 API 密钥。',
      ],
    ],
    finalTitle: '今天就把 Kimi K3 接入编程智能体',
    finalDesc: '从标准请求开始，再按实际任务选择合适的模型。',
    footer: '通过一个开发者 API 接入领先的中国 AI 模型',
  },
};

function snapshot(selector, attribute) {
  const element = document.head.querySelector(selector);
  return {
    element,
    existed: Boolean(element),
    hadAttribute: element?.hasAttribute(attribute) ?? false,
    value: element?.getAttribute(attribute) ?? '',
  };
}

function setHeadValue(state, tag, identity, identityValue, attribute, value) {
  const element =
    state.element ?? document.head.appendChild(document.createElement(tag));
  element.setAttribute(identity, identityValue);
  element.setAttribute(attribute, value);
  state.element = element;
}

function restore(state, attribute) {
  if (!state.element) return;
  if (!state.existed) state.element.remove();
  else if (state.hadAttribute)
    state.element.setAttribute(attribute, state.value);
  else state.element.removeAttribute(attribute);
}

function CopyBlock({ code, labels }) {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const copy = async () => {
    const result = await copyTextToClipboard(code, navigator?.clipboard);
    setStatus(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 1800);
  };

  const label =
    status === 'copied'
      ? labels.copied
      : status === 'error'
        ? labels.copyError
        : labels.copy;

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        type='button'
        onClick={copy}
        aria-label={labels.copy}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '6px 10px',
          background: C.card,
          color: C.strong,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      <pre
        style={{
          margin: 0,
          padding: '54px 20px 20px',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflowX: 'auto',
          background: C.code,
          color: C.strong,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        <code>{code}</code>
      </pre>
      <span role='status' aria-live='polite' className='sr-only'>
        {status === 'idle' ? '' : label}
      </span>
    </div>
  );
}

function PrimaryLink({ href, children, onClick, inverse = false }) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 42,
        padding: '0 18px',
        borderRadius: 10,
        background: inverse ? '#fff' : C.accent,
        color: inverse ? '#111' : '#fff',
        fontWeight: 650,
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}

function EvidenceCard({ title, badge, facts, note, children }) {
  return (
    <article
      className='flex h-full flex-col rounded-2xl border p-6 text-left'
      style={{ borderColor: C.border }}
    >
      <div className='flex items-center justify-between gap-3'>
        <p
          className='text-sm font-semibold uppercase'
          style={{ color: C.accent }}
        >
          {title}
        </p>
        <span
          className='shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold'
          style={{
            color: C.accent,
            borderColor: C.border,
            background: C.accentBg,
          }}
        >
          {badge}
        </span>
      </div>
      <ul
        className='mt-4 space-y-2.5 text-sm leading-6'
        style={{ color: C.body }}
      >
        {facts.map((fact) => (
          <li key={fact} className='flex gap-2'>
            <span aria-hidden='true' style={{ color: C.accent }}>
              ·
            </span>
            <span className='min-w-0'>{fact}</span>
          </li>
        ))}
      </ul>
      {children}
      {note && (
        <p
          className='mt-4 border-t pt-3 text-xs leading-5'
          style={{ color: C.muted, borderColor: C.border }}
        >
          {note}
        </p>
      )}
    </article>
  );
}

const KimiK3Api = () => {
  const { i18n } = useTranslation();
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const isZh = i18n.language?.toLowerCase().startsWith('zh');
  const text = isZh ? TEXT.zh : TEXT.en;
  const [activeExample, setActiveExample] = useState('curl');
  const isAuthenticated = Boolean(userState?.user);
  const destination = getKimiK3CtaDestination(
    isAuthenticated,
    typeof window === 'undefined' ? '' : window.location.search,
  );
  const activeCode = useMemo(
    () =>
      KIMI_K3_CODE_EXAMPLES.find((item) => item.id === activeExample) ??
      KIMI_K3_CODE_EXAMPLES[0],
    [activeExample],
  );

  useEffect(() => {
    const meta = getKimiK3Metadata(i18n.language);
    const previousTitle = document.title;
    const states = {
      description: snapshot('meta[name="description"]', 'content'),
      ogTitle: snapshot('meta[property="og:title"]', 'content'),
      ogDescription: snapshot('meta[property="og:description"]', 'content'),
      ogUrl: snapshot('meta[property="og:url"]', 'content'),
      canonical: snapshot('link[rel="canonical"]', 'href'),
    };
    document.title = meta.title;
    setHeadValue(
      states.description,
      'meta',
      'name',
      'description',
      'content',
      meta.description,
    );
    setHeadValue(
      states.ogTitle,
      'meta',
      'property',
      'og:title',
      'content',
      meta.ogTitle,
    );
    setHeadValue(
      states.ogDescription,
      'meta',
      'property',
      'og:description',
      'content',
      meta.ogDescription,
    );
    setHeadValue(
      states.ogUrl,
      'meta',
      'property',
      'og:url',
      'content',
      meta.canonical,
    );
    setHeadValue(
      states.canonical,
      'link',
      'rel',
      'canonical',
      'href',
      meta.canonical,
    );

    return () => {
      document.title = previousTitle;
      restore(states.description, 'content');
      restore(states.ogTitle, 'content');
      restore(states.ogDescription, 'content');
      restore(states.ogUrl, 'content');
      restore(states.canonical, 'href');
    };
  }, [i18n.language]);

  const go = (location) => (event) => {
    event.preventDefault();
    trackEvent('get_started_clicked', { location });
    navigate(destination);
  };

  return (
    <div
      className='vancine-public-page vancine-k3-api-page'
      style={{
        minHeight: '100vh',
        background: 'var(--vc-page-bg)',
        overflowWrap: 'break-word',
      }}
    >
      <KimiK3Header labels={text} />

      <main>
        <section className='relative overflow-hidden px-5 py-24 text-center md:py-32'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-3xl'
            style={{ background: C.accentBg }}
          />
          <div className='relative mx-auto max-w-4xl'>
            <p
              className='mb-4 text-sm font-semibold uppercase tracking-wider'
              style={{ color: C.accent }}
            >
              {text.eyebrow}
            </p>
            <h1
              className='text-4xl font-bold tracking-tight md:text-6xl'
              style={{ color: C.strong }}
            >
              {text.title}
            </h1>
            <p
              className='mx-auto mt-6 max-w-3xl text-lg leading-8'
              style={{ color: C.body }}
            >
              {text.intro}
            </p>
            <p
              className='mt-5 inline-flex rounded-full border px-3 py-1 text-sm font-medium'
              style={{
                color: C.accent,
                borderColor: C.border,
                background: C.accentBg,
              }}
            >
              {isZh
                ? '新账号有 1 美元免费额度，无需信用卡。实际用量取决于模型和请求。'
                : KIMI_K3_CREDIT_DISCLAIMER}
            </p>
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <PrimaryLink href={destination} onClick={go('kimi_k3_hero')}>
                {text.start}
              </PrimaryLink>
              <a
                href='#quickstart'
                className='inline-flex min-h-[42px] items-center justify-center rounded-[10px] border px-[18px] font-semibold no-underline'
                style={{ color: C.strong, borderColor: C.border }}
              >
                {text.quickstartLink}
              </a>
            </div>
          </div>
        </section>

        <section
          id='quickstart'
          className='border-y px-5 py-20'
          style={{ borderColor: C.border, background: C.card }}
        >
          <div className='mx-auto max-w-5xl'>
            <div className='mb-8 text-center'>
              <h2 className='text-3xl font-bold' style={{ color: C.strong }}>
                {text.quickstart}
              </h2>
              <p className='mt-3' style={{ color: C.body }}>
                {text.quickstartDesc}
              </p>
            </div>
            <div
              className='mb-3 flex flex-wrap gap-2'
              role='group'
              aria-label='Quickstart languages'
            >
              {KIMI_K3_CODE_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type='button'
                  aria-pressed={activeExample === example.id}
                  onClick={() => setActiveExample(example.id)}
                  className='rounded-lg border px-3 py-2 text-sm font-semibold'
                  style={{
                    cursor: 'pointer',
                    borderColor: C.border,
                    background:
                      activeExample === example.id ? C.accent : C.card,
                    color: activeExample === example.id ? '#fff' : C.strong,
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <CopyBlock code={activeCode.code} labels={text} />
            <div className='mt-5 flex flex-wrap justify-between gap-3'>
              <a
                href='https://vancine.com/docs'
                target='_blank'
                rel='noopener noreferrer'
              >
                {text.docs}
              </a>
              <PrimaryLink
                href={destination}
                onClick={go('kimi_k3_quickstart')}
              >
                {isAuthenticated ? text.playground : text.start}
              </PrimaryLink>
            </div>
          </div>
        </section>

        <section id='agents' className='px-5 py-20'>
          <div className='mx-auto grid max-w-6xl gap-8 lg:grid-cols-2'>
            <div>
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                OpenCode
              </p>
              <h2
                className='mt-3 text-3xl font-bold'
                style={{ color: C.strong }}
              >
                {text.agents}
              </h2>
              <p className='mt-4 leading-7' style={{ color: C.body }}>
                {text.agentsDesc}
              </p>
            </div>
            <CopyBlock code={KIMI_K3_OPENCODE_CONFIG} labels={text} />
            <article
              className='rounded-2xl border p-6 lg:col-span-2'
              style={{ borderColor: C.border }}
            >
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                {text.clineTitle}
              </p>
              <ol
                className='mt-4 list-decimal space-y-2 pl-5 leading-7'
                style={{ color: C.body }}
              >
                {text.clineSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        <section
          id='evidence'
          className='px-5 py-20'
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <div className='mx-auto max-w-5xl'>
            <div className='text-center'>
              <p
                className='text-sm font-semibold uppercase'
                style={{ color: C.accent }}
              >
                {text.evidenceEyebrow}
              </p>
              <h2
                className='mt-3 text-3xl font-bold'
                style={{ color: C.strong }}
              >
                {text.evidenceTitle}
              </h2>
              <p
                className='mx-auto mt-4 max-w-2xl leading-7'
                style={{ color: C.body }}
              >
                {text.evidenceDesc}
              </p>
            </div>
            <div className='mt-10 grid gap-4 md:grid-cols-3'>
              <EvidenceCard
                title={text.apiCompatibilityTitle}
                badge={text.badgeVerified}
                facts={text.apiCompatibilityFacts}
                note={text.apiCompatibilityNote}
              />
              <EvidenceCard
                title={text.openCodeAgentTitle}
                badge={text.badgeVerified}
                facts={text.openCodeAgentFacts}
              >
                <a
                  href={KIMI_K3_EVIDENCE_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={() =>
                    trackEvent('developer_resource_clicked', {
                      resource: 'verified_evidence',
                      location: 'evidence',
                    })
                  }
                  className='mt-4 inline-block text-sm font-semibold'
                  style={{ color: C.accent }}
                >
                  {text.evidenceViewVerified}
                </a>
              </EvidenceCard>
              <EvidenceCard
                title={text.measuredUsageTitle}
                badge={text.measuredUsageBadge}
                facts={[]}
              >
                <dl className='mt-4 space-y-4'>
                  <div>
                    <dt
                      className='text-xs font-semibold uppercase tracking-wide'
                      style={{ color: C.muted }}
                    >
                      {text.measuredUsageTokensLabel}
                    </dt>
                    <dd
                      className='mt-1 text-2xl font-bold'
                      style={{ color: C.strong }}
                    >
                      {KIMI_K3_MEASURED_USAGE.agentTelemetryTokens.toLocaleString(
                        'en-US',
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt
                      className='text-xs font-semibold uppercase tracking-wide'
                      style={{ color: C.muted }}
                    >
                      {text.measuredUsageAmountLabel}
                    </dt>
                    <dd
                      className='mt-1 text-2xl font-bold'
                      style={{ color: C.strong }}
                    >
                      ${KIMI_K3_MEASURED_USAGE.amount.toFixed(2)}{' '}
                      <span
                        className='text-sm font-semibold'
                        style={{ color: C.muted }}
                      >
                        {KIMI_K3_MEASURED_USAGE.currency}
                      </span>
                    </dd>
                  </div>
                </dl>
                <p
                  className='mt-4 border-t pt-3 text-xs leading-5'
                  style={{ color: C.muted, borderColor: C.border }}
                >
                  {isZh
                    ? KIMI_K3_MEASURED_USAGE_DISCLAIMER.zh
                    : KIMI_K3_MEASURED_USAGE_DISCLAIMER.en}
                </p>
              </EvidenceCard>
            </div>
            <p
              className='mx-auto mt-8 max-w-3xl text-center text-xs leading-5'
              style={{ color: C.muted }}
            >
              {isZh
                ? KIMI_K3_VERIFICATION_SCOPE.zh
                : KIMI_K3_VERIFICATION_SCOPE.en}
            </p>
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <PrimaryLink href={destination} onClick={go('kimi_k3_evidence')}>
                {text.evidenceRunPlayground}
              </PrimaryLink>
              <a
                href={KIMI_K3_EVIDENCE_STARTER_REPO}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() =>
                  trackEvent('developer_resource_clicked', {
                    resource: 'starter_repo',
                    location: 'evidence',
                  })
                }
                className='inline-flex min-h-[42px] items-center justify-center rounded-[10px] border px-[18px] font-semibold no-underline'
                style={{ color: C.strong, borderColor: C.border }}
              >
                {text.evidenceViewStarter}
              </a>
            </div>
          </div>
        </section>

        <section className='px-5 py-20' style={{ background: C.card }}>
          <div className='mx-auto max-w-6xl text-center'>
            <h2 className='text-3xl font-bold' style={{ color: C.strong }}>
              {text.portfolio}
            </h2>
            <p className='mx-auto mt-3 max-w-2xl' style={{ color: C.body }}>
              {text.portfolioDesc}
            </p>
            <div className='mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
              {KIMI_K3_PORTFOLIO.map((model) => (
                <div
                  key={model}
                  className='rounded-xl border p-4 font-semibold'
                  style={{ borderColor: C.border, color: C.strong }}
                >
                  {model}
                </div>
              ))}
            </div>
            <a
              className='mt-6 inline-block font-semibold'
              href='https://vancine.com/pricing'
              target='_blank'
              rel='noopener noreferrer'
            >
              {text.pricing}
            </a>
          </div>
        </section>

        <section className='px-5 py-20'>
          <div className='mx-auto max-w-4xl'>
            <h2
              className='text-center text-3xl font-bold'
              style={{ color: C.strong }}
            >
              {text.faq}
            </h2>
            <div className='mt-8 space-y-3'>
              {text.faqs.map(([question, answer]) => (
                <details
                  key={question}
                  className='rounded-xl border p-5'
                  style={{ borderColor: C.border }}
                >
                  <summary
                    className='cursor-pointer font-semibold'
                    style={{ color: C.strong }}
                  >
                    {question}
                  </summary>
                  <p className='mt-3 leading-7' style={{ color: C.body }}>
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          className='px-5 py-20 text-center'
          style={{ background: C.accent, color: '#fff' }}
        >
          <div className='mx-auto max-w-3xl'>
            <h2 className='text-3xl font-bold'>{text.finalTitle}</h2>
            <p className='mt-4 opacity-80'>{text.finalDesc}</p>
            <div className='mt-7'>
              <PrimaryLink
                href={destination}
                onClick={go('kimi_k3_final_cta')}
                inverse
              >
                {text.start}
              </PrimaryLink>
            </div>
          </div>
        </section>
      </main>

      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px 48px',
          borderTop: `1px solid var(--vc-border)`,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--vc-text-subtle)',
            lineHeight: 2,
          }}
        >
          © {new Date().getFullYear()} Vancine · {text.footer}
        </p>
      </div>
    </div>
  );
};

export default KimiK3Api;
