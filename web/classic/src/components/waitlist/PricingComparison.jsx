import React from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const comparisons = [
  {
    category: '文本生成', categoryEn: 'Text Generation',
    model: 'DeepSeek V4 Pro',
    direct: 'DeepSeek 官方 需中国账号',
    directEn: 'DeepSeek official, needs Chinese account',
    vancine: '$0.30/M tokens',
    note: '无需注册中国账号',
    noteEn: 'No Chinese account needed',
    saving: '~30%',
  },
  {
    category: '文本生成', categoryEn: 'Text Generation',
    model: 'Qwen 3',
    direct: '阿里云百炼 需企业认证',
    directEn: 'Alibaba Cloud requires enterprise auth',
    vancine: '$0.40/M tokens',
    note: '个人即可使用',
    noteEn: 'Available for individuals',
    saving: '',
  },
  {
    category: '文本生成', categoryEn: 'Text Generation',
    model: 'Kimi K2.5',
    direct: 'Moonshot 需中国账号',
    directEn: 'Moonshot, needs Chinese account',
    vancine: '$0.50/M tokens',
    note: '全球直接访问',
    noteEn: 'Direct global access',
    saving: '~25%',
  },
  {
    category: '图片生成', categoryEn: 'Image Generation',
    model: 'Seedream 4.0',
    direct: '火山方舟 需实名认证',
    directEn: 'Volcengine, real-name verification required',
    vancine: '$0.015/张',
    note: '无需实名认证',
    noteEn: 'No real-name verification',
    saving: '~40%',
  },
  {
    category: '视频生成', categoryEn: 'Video Generation',
    model: 'Seedance 2.0',
    direct: '火山方舟 需企业认证',
    directEn: 'Volcengine, enterprise auth required',
    vancine: '$0.10/段',
    note: '个人直接调用',
    noteEn: 'Direct access for individuals',
    saving: '~50%',
  },
  {
    category: '视频生成', categoryEn: 'Video Generation',
    model: 'Hailuo 2.3',
    direct: 'MiniMax 需中国账号',
    directEn: 'MiniMax, needs Chinese account',
    vancine: '$0.08/段',
    note: '无需中国身份',
    noteEn: 'No Chinese identity needed',
    saving: '~40%',
  },
  {
    category: '3D 生成', categoryEn: '3D Generation',
    model: 'Seed3D 2.0',
    direct: '火山方舟 需企业认证',
    directEn: 'Volcengine, enterprise auth required',
    vancine: '$0.10/次',
    note: '个人即可使用',
    noteEn: 'Available for individuals',
    saving: '',
  },
];

const PricingComparison = () => {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  return (
    <div style={{ padding: '80px 24px', background: 'var(--semi-color-fill-0)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title heading={2}>{isZh ? '为什么选择 Vancine？' : 'Why Choose Vancine?'}</Title>
          <Text style={{ opacity: 0.6, fontSize: 15, display: 'block', marginTop: 8 }}>
            {isZh
              ? '直接调用中国 AI 厂商 API 的痛点 vs 通过 Vancine 的体验'
              : 'Pain points of calling Chinese AI APIs directly vs using Vancine'}
          </Text>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--semi-color-border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>{isZh ? '模型' : 'Model'}</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, opacity: 0.6 }}>{isZh ? '直接调用国内 API' : 'Direct Chinese API'}</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#9B93F2' }}>Vancine</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, opacity: 0.6 }}>{isZh ? '优势' : 'Advantage'}</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--semi-color-border)' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 600 }}>{row.model}</div>
                    <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{isZh ? row.category : row.categoryEn}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ opacity: 0.7 }}>{isZh ? row.direct : row.directEn}</div>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#9B93F2', fontSize: 15 }}>
                    {row.vancine}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#00B464', fontWeight: 500 }}>
                      {isZh ? row.note : row.noteEn}
                    </div>
                    {row.saving && (
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 999, marginTop: 4,
                        fontSize: 12, fontWeight: 500, background: 'rgba(0,180,100,0.1)', color: '#00B464',
                      }}>
                        {isZh ? `便宜 ${row.saving}` : `${row.saving} cheaper`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Key selling points */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, marginTop: 48,
        }}>
          {[
            { icon: '🌏', title: isZh ? '无需中国身份' : 'No Chinese ID Required', desc: isZh ? '不需要中国手机号、身份证或企业认证' : 'No Chinese phone, ID card or enterprise auth needed' },
            { icon: '💳', title: isZh ? 'USD 直接结算' : 'Pay in USD', desc: isZh ? '支持 PayPal / Stripe，无需支付宝或微信支付' : 'PayPal / Stripe supported, no Alipay or WeChat Pay' },
            { icon: '🔌', title: isZh ? 'OpenAI 兼容协议' : 'OpenAI Compatible', desc: isZh ? '一个 API 调用所有模型，零学习成本' : 'One API for all models, zero learning curve' },
            { icon: '⚡', title: isZh ? '全球加速节点' : 'Global Edge Network', desc: isZh ? '低延迟，无需翻墙回中国' : 'Low latency, no need to route back to China' },
          ].map((item) => (
            <div key={item.title} style={{
              padding: 20, borderRadius: 12, textAlign: 'center',
              border: '1px solid var(--semi-color-border)',
              background: 'var(--semi-color-bg-1)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PricingComparison;
