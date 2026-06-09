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
import React, { useEffect, useState, useRef } from 'react';
import {
  Banner,
  Button,
  Form,
  Row,
  Col,
  Typography,
  Spin,
  Switch,
  Select,
} from '@douyinfe/semi-ui';
const { Text } = Typography;
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { IconEyeOpened, IconEyeClosed } from '@douyinfe/semi-icons';

export default function SettingsPaymentGatewayPayPal(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('PayPal 设置');
  const [loading, setLoading] = useState(false);

  // Use independent state for switches to avoid Form sync issues
  const [payPalEnabled, setPayPalEnabled] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const [inputs, setInputs] = useState({
    PayPalClientId: '',
    PayPalClientSecret: '',
    PayPalWebhookId: '',
    PayPalSandboxClientId: '',
    PayPalSandboxClientSecret: '',
    PayPalSandboxWebhookId: '',
    PayPalMinTopUp: 1,
    PayPalCurrency: 'USD',
  });
  const [originInputs, setOriginInputs] = useState({});
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options) {
      const enabled = !!props.options.PayPalEnabled;
      const test = props.options.PayPalTestMode === 'true' || props.options.PayPalTestMode === true;
      setPayPalEnabled(enabled);
      setTestMode(test);

      const formValues = {
        PayPalClientId: props.options.PayPalClientId || '',
        PayPalClientSecret: props.options.PayPalClientSecret || '',
        PayPalWebhookId: props.options.PayPalWebhookId || '',
        PayPalSandboxClientId: props.options.PayPalSandboxClientId || '',
        PayPalSandboxClientSecret: props.options.PayPalSandboxClientSecret || '',
        PayPalSandboxWebhookId: props.options.PayPalSandboxWebhookId || '',
        PayPalMinTopUp: parseInt(props.options.PayPalMinTopUp) || 1,
        PayPalCurrency: props.options.PayPalCurrency || 'USD',
      };
      setInputs(formValues);
      setOriginInputs({ ...formValues });
      if (formApiRef.current) {
        formApiRef.current.setValues(formValues);
      }
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs((prev) => ({ ...prev, ...values }));
  };

  const toggleSecret = (field) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const renderSecretField = (field, label, placeholder) => (
    <Form.Input
      field={field}
      label={label}
      placeholder={placeholder}
      type={showSecrets[field] ? 'text' : 'password'}
      suffix={
        <span
          style={{ cursor: 'pointer', color: 'var(--semi-color-text-2)' }}
          onClick={() => toggleSecret(field)}
        >
          {showSecrets[field] ? <IconEyeOpened /> : <IconEyeClosed />}
        </span>
      }
    />
  );

  const submitPayPalSetting = async () => {
    setLoading(true);
    try {
      const options = [];

      options.push({ key: 'PayPalEnabled', value: payPalEnabled ? 'true' : 'false' });
      options.push({ key: 'PayPalTestMode', value: testMode ? 'true' : 'false' });

      if (inputs.PayPalClientId) {
        options.push({ key: 'PayPalClientId', value: inputs.PayPalClientId });
      }
      if (inputs.PayPalClientSecret) {
        options.push({ key: 'PayPalClientSecret', value: inputs.PayPalClientSecret });
      }
      if (inputs.PayPalWebhookId) {
        options.push({ key: 'PayPalWebhookId', value: inputs.PayPalWebhookId });
      }
      if (inputs.PayPalSandboxClientId) {
        options.push({ key: 'PayPalSandboxClientId', value: inputs.PayPalSandboxClientId });
      }
      if (inputs.PayPalSandboxClientSecret) {
        options.push({ key: 'PayPalSandboxClientSecret', value: inputs.PayPalSandboxClientSecret });
      }
      if (inputs.PayPalSandboxWebhookId) {
        options.push({ key: 'PayPalSandboxWebhookId', value: inputs.PayPalSandboxWebhookId });
      }

      options.push({ key: 'PayPalMinTopUp', value: String(inputs.PayPalMinTopUp || 1) });
      options.push({ key: 'PayPalCurrency', value: inputs.PayPalCurrency || 'USD' });

      const requestQueue = options.map((opt) =>
        API.put('/api/option/', { key: opt.key, value: opt.value }),
      );

      const results = await Promise.all(requestQueue);
      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => showError(res.data.message));
      } else {
        showSuccess(t('更新成功'));
        setOriginInputs({ ...inputs });
        props.refresh?.();
      }
    } catch (error) {
      showError(t('更新失败'));
    }
    setLoading(false);
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<BookOpen size={16} />}
            description={
              <>
                {t('PayPal 支付集成，支持国际信用卡和 PayPal 钱包付款。')}
                <br />
                {t('请在')}
                <a href='https://developer.paypal.com' target='_blank' rel='noreferrer'>
                  PayPal Developer Dashboard
                </a>
                {t('获取 Client ID 和 Secret。')}
              </>
            }
            style={{ marginBottom: 16 }}
          />

          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('启用 PayPal 支付')}
                </Text>
                <Switch
                  checked={payPalEnabled}
                  onChange={(checked) => setPayPalEnabled(checked)}
                  checkedText='ON'
                  uncheckedText='OFF'
                />
              </div>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('沙盒模式')}
                </Text>
                <Switch
                  checked={testMode}
                  onChange={(checked) => setTestMode(checked)}
                  checkedText='Sandbox'
                  uncheckedText='Production'
                />
              </div>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field='PayPalMinTopUp'
                label={t('最低充值额度 (USD)')}
                min={1}
              />
            </Col>
          </Row>

          {testMode ? (
            <>
              <Banner
                type='warning'
                description={t('当前为 Sandbox 模式，使用沙盒环境的 Client ID 和 Secret')}
                style={{ marginBottom: 16, marginTop: 16 }}
              />
              <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalSandboxClientId', t('Sandbox Client ID'), t('PayPal Sandbox Client ID'))}
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalSandboxClientSecret', t('Sandbox Client Secret'), t('PayPal Sandbox Client Secret'))}
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalSandboxWebhookId', t('Sandbox Webhook ID'), t('PayPal Sandbox Webhook ID'))}
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Banner
                type='info'
                description={t('当前为 Production 模式，使用正式环境的 Client ID 和 Secret')}
                style={{ marginBottom: 16, marginTop: 16 }}
              />
              <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalClientId', t('Production Client ID'), t('PayPal Client ID'))}
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalClientSecret', t('Production Client Secret'), t('PayPal Client Secret'))}
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  {renderSecretField('PayPalWebhookId', t('Production Webhook ID'), t('PayPal Webhook ID'))}
                </Col>
              </Row>
            </>
          )}

          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Select field='PayPalCurrency' label={t('默认货币')}>
                <Select.Option value='USD'>USD ($)</Select.Option>
                <Select.Option value='EUR'>EUR (€)</Select.Option>
                <Select.Option value='GBP'>GBP (£)</Select.Option>
              </Form.Select>
            </Col>
          </Row>

          <Banner
            type='info'
            description={
              <div>
                <Text strong>{t('Webhook URL')}</Text>
                <br />
                <Text code>
                  {props.options?.ServerAddress || 'https://vancine.com'}
                  /api/paypal/webhook
                </Text>
                <br />
                <Text type='tertiary'>
                  {t('请在 PayPal Dashboard 中配置此 Webhook URL，订阅事件：CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED')}
                </Text>
              </div>
            }
            style={{ marginBottom: 16, marginTop: 16 }}
          />

          <Text type='tertiary' style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            {t('出于安全考虑，已保存的密钥不会显示。留空的字段不会覆盖已有值。')}
          </Text>
          <Button onClick={submitPayPalSetting} style={{ marginTop: 16 }}>
            {t('更新 PayPal 设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
