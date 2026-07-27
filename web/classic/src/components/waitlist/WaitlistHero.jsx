import React, { useEffect, useState } from 'react';
import { Button, Input, Typography, Toast } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const WaitlistHero = () => {
  const { t } = useTranslation('waitlist');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    API.get('/api/waitlist/count')
      .then((res) => {
        if (res.data?.success && res.data?.data?.count) {
          setCount(res.data.data.count);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Toast.error(t('hero.toastValid'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/api/waitlist', { email, source: 'direct' });
      if (res.data?.success) {
        Toast.success(t('hero.toastSuccess'));
        setCount((c) => c + 1);
        setJoined(true);
      } else {
        showError(res.data?.message || t('hero.toastFail'));
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
          {t('hero.badge')}
        </div>

        <Title heading={1} style={{ marginBottom: 16, fontSize: 'clamp(2rem, 4.5vw, 3rem)' }}>
          {t('hero.title')}
        </Title>

        <Text style={{ display: 'block', marginBottom: 12, fontSize: 17, opacity: 0.85, lineHeight: 1.6 }}>
          {t('hero.sub1')}
        </Text>

        <Text style={{ display: 'block', marginBottom: 32, fontSize: 14, opacity: 0.55, lineHeight: 1.6 }}>
          {t('hero.sub2')}
        </Text>

        {joined ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '16px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500,
            background: 'rgba(0,180,100,0.08)', color: '#00B464',
            border: '1px solid rgba(0,180,100,0.2)',
          }}>
            ✓ {t('hero.joinedMsg')}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, maxWidth: 440, margin: '0 auto' }}>
            <Input
              placeholder={t('hero.placeholder')}
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
              {t('hero.button')}
            </Button>
          </div>
        )}

        {count > 0 && (
          <Text style={{ display: 'block', marginTop: 20, fontSize: 14, opacity: 0.5 }}>
            {t('hero.countText', { count })}
          </Text>
        )}
      </div>
    </div>
  );
};

export default WaitlistHero;