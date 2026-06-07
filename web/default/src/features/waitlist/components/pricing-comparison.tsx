/*
Copyright (C) 2023-2026 QuantumNous
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

const comparisons = [
  {
    model: 'DeepSeek V4 Pro',
    category: 'LLM',
    direct: 'DeepSeek official, needs Chinese account',
    directZh: 'DeepSeek 官方，需中国账号',
    vancine: '$0.27/M tokens',
    note: 'No Chinese account needed',
    noteZh: '无需注册中国账号',
    saving: '~30%',
  },
  {
    model: 'Qwen 3',
    category: 'LLM',
    direct: 'Alibaba Cloud, enterprise auth required',
    directZh: '阿里云百炼，需企业认证',
    vancine: '$0.40/M tokens',
    note: 'Available for individuals',
    noteZh: '个人即可使用',
    saving: '',
  },
  {
    model: 'Seedream 4.0',
    category: 'Image',
    direct: 'Volcengine, real-name verification required',
    directZh: '火山方舟，需实名认证',
    vancine: '$0.015/img',
    note: 'No real-name verification',
    noteZh: '无需实名认证',
    saving: '~40%',
  },
  {
    model: 'Seedance 2.0',
    category: 'Video',
    direct: 'Volcengine, enterprise auth required',
    directZh: '火山方舟，需企业认证',
    vancine: '$0.10/clip',
    note: 'Direct access for individuals',
    noteZh: '个人直接调用',
    saving: '~50%',
  },
  {
    model: 'Kling V2',
    category: 'Video',
    direct: 'Kuaishou, needs Chinese phone number',
    directZh: '快手可灵，需中国手机号',
    vancine: '$0.15/clip',
    note: 'No Chinese phone number',
    noteZh: '无需中国手机号',
    saving: '~35%',
  },
  {
    model: 'Trellis',
    category: '3D',
    direct: 'Self-deploy on GPU servers',
    directZh: '需自行部署 GPU 服务器',
    vancine: '$0.10/次',
    note: 'Ready to use, no GPU needed',
    noteZh: '即开即用，无需 GPU',
    saving: '',
  },
]

const sellingPoints = [
  {
    icon: '🌏',
    title: 'No Chinese ID Required',
    titleZh: '无需中国身份',
    desc: 'No Chinese phone, ID card or enterprise auth needed',
    descZh: '不需要中国手机号、身份证或企业认证',
  },
  {
    icon: '💳',
    title: 'Pay in USD',
    titleZh: 'USD 直接结算',
    desc: 'PayPal / Stripe supported, no Alipay or WeChat Pay',
    descZh: '支持 PayPal / Stripe，无需支付宝或微信支付',
  },
  {
    icon: '🔌',
    title: 'OpenAI Compatible',
    titleZh: 'OpenAI 兼容协议',
    desc: 'One API for all models, zero learning curve',
    descZh: '一个 API 调用所有模型，零学习成本',
  },
  {
    icon: '⚡',
    title: 'Global Edge Network',
    titleZh: '全球加速节点',
    desc: 'Low latency, no need to route back to China',
    descZh: '低延迟，无需翻墙回中国',
  },
]

export function PricingComparison() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  return (
    <section className='bg-muted/30 relative px-6 py-16 md:py-24'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-12 text-center'>
          <h2
            className='landing-animate-fade-up text-2xl font-bold tracking-tight opacity-0 md:text-3xl'
            style={{ animationDelay: '300ms' }}
          >
            {t('Why Choose Vancine?')}
          </h2>
          <p
            className='landing-animate-fade-up text-muted-foreground/70 mt-3 text-sm opacity-0 md:text-base'
            style={{ animationDelay: '360ms' }}
          >
            {isZh
              ? '直接调用中国 AI 厂商 API 的痛点 vs 通过 Vancine 的体验'
              : 'Pain points of calling Chinese AI APIs directly vs using Vancine'}
          </p>
        </div>

        <div
          className='landing-animate-fade-up opacity-0'
          style={{ animationDelay: '420ms' }}
        >
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-border/50 border-b-2'>
                  <th className='px-4 py-3 text-left font-semibold'>{t('Model')}</th>
                  <th className='text-muted-foreground px-4 py-3 text-left font-medium'>
                    {isZh ? '直接调用国内 API' : 'Direct Chinese API'}
                  </th>
                  <th className='px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400'>
                    Vancine
                  </th>
                  <th className='px-4 py-3 text-center font-semibold'>
                    {isZh ? '优势' : 'Advantage'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr
                    key={row.model}
                    className='border-border/30 border-b transition-colors hover:bg-muted/50'
                  >
                    <td className='px-4 py-4'>
                      <div className='font-medium'>{row.model}</div>
                      <div className='text-muted-foreground/50 mt-0.5 text-xs'>{row.category}</div>
                    </td>
                    <td className='text-muted-foreground px-4 py-4'>
                      {isZh ? row.directZh : row.direct}
                    </td>
                    <td className='px-4 py-4 text-center font-semibold text-purple-600 dark:text-purple-400'>
                      {row.vancine}
                    </td>
                    <td className='px-4 py-4 text-center'>
                      <div className='text-sm text-green-600 dark:text-green-400'>
                        {isZh ? row.noteZh : row.note}
                      </div>
                      {row.saving && (
                        <span className='mt-1 inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:bg-green-400/10 dark:text-green-400'>
                          {isZh ? `便宜 ${row.saving}` : `${row.saving} cheaper`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selling points */}
        <div className='mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {sellingPoints.map((item, i) => (
            <div
              key={item.title}
              className={`landing-animate-fade-up border-border/40 bg-card rounded-xl border p-5 text-center opacity-0 shadow-xs`}
              style={{ animationDelay: `${500 + i * 80}ms` }}
            >
              <div className='mb-2 text-2xl'>{item.icon}</div>
              <div className='text-sm font-semibold'>
                {isZh ? item.titleZh : item.title}
              </div>
              <div className='text-muted-foreground/60 mt-1.5 text-xs leading-relaxed'>
                {isZh ? item.descZh : item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
