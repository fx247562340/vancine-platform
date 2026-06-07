import React, { useEffect, useState } from 'react';
import { Button, Input, Typography, Toast } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const WaitlistHero = () => {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    API.get('/api/waitlist/count')
      .then((res) => {
        if (res.data?.success && res.data.data?.count) {
          setCount(res.data.data.count);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Toast.error(isZh ? '请输入有效的邮箱地址' : 'Please enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/api/waitlist', { email, source: 'direct' });
      if (res.data?.success) {
        Toast.success(isZh ? '已成功加入等待列表！' : 'Successfully joined the waitlist!');
        setCount((c) => c + 1);
        setJoined(true);
      } else {
        showError(res.data?.message || (isZh ? '加入失败' : 'Failed to join'));
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '120px 24px 80px', textAlign: 'center',
      background: 'linear-gradient(135deg, rgba(155,147,242,0.08) 0%, rgba(100,100,255,0.05) 100%)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: -1, opacity: 0.06,
        backgroundImage: 'linear-gradient(to right, var(--semi-color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--semi-color-border) 1px, transparent 1px)',
        backgroundSize: '4rem 4rem',
        maskImage: 'radial-gradient(ellipse 60% 50% at 50% 30%, black 20%, transparent 100%)',
      }} />

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
          background: 'rgba(155,147,242,0.1)', color: '#9B93F2',
          border: '1px solid rgba(155,147,242,0.2)', marginBottom: 20,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#9B93F2',
            animation: 'pulse 2s infinite',
          }} />
          {isZh ? '抢先体验' : 'Early Access'}
        </div>

        <Title heading={1} style={{ marginBottom: 16, fontSize: 'clamp(2rem, 4.5vw, 3rem)' }}>
          {isZh ? '中国 AI 模型，全球可用' : 'Chinese AI Models, Globally Accessible'}
        </Title>

        <Text style={{ display: 'block', marginBottom: 12, fontSize: 17, opacity: 0.85, lineHeight: 1.6 }}>
          {isZh
            ? '一个 API 访问 DeepSeek、Qwen、Seedream、Seedance 等中国顶级 AI 模型'
            : 'Access DeepSeek, Qwen, Seedream, Seedance and more through a single OpenAI-compatible API'}
        </Text>

        <Text style={{ display: 'block', marginBottom: 32, fontSize: 14, opacity: 0.55, lineHeight: 1.6 }}>
          {isZh
            ? '无需中国手机号 · 无需支付宝 · USD 直接结算 · 比直接调用国内 API 更便宜'
            : 'No Chinese phone number required · No Alipay · Pay in USD · Cheaper than calling Chinese APIs directly'}
        </Text>

        {joined ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '16px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500,
            background: 'rgba(0,180,100,0.08)', color: '#00B464',
            border: '1px solid rgba(0,180,100,0.2)',
          }}>
            ✓ {isZh ? '你已加入等待列表！我们会通知你。' : "You're on the waitlist! We'll notify you when it's your turn."}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, maxWidth: 440, margin: '0 auto' }}>
            <Input
              placeholder={isZh ? '输入你的邮箱' : 'Enter your email'}
              value={email}
              onChange={setEmail}
              onPressEnter={handleSubmit}
              style={{ flex: 1, height: 44 }}
              size='large'
            />
            <Button
              type='primary'
              loading={loading}
              onClick={handleSubmit}
              style={{ height: 44, padding: '0 24px', background: '#9B93F2', borderColor: '#9B93F2' }}
            >
              {isZh ? '加入等待列表' : 'Join Waitlist'}
            </Button>
          </div>
        )}

        {count > 0 && (
          <Text style={{ display: 'block', marginTop: 20, fontSize: 14, opacity: 0.5 }}>
            {isZh ? `${count} 位开发者已加入等待列表` : `${count} developers have joined the waitlist`}
          </Text>
        )}
      </div>
    </div>
  );
};

export default WaitlistHero;
