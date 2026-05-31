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
  Table,
  Modal,
  Input,
  InputNumber,
  Select,
} from '@douyinfe/semi-ui';
const { Text } = Typography;
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, Trash2 } from 'lucide-react';

export default function SettingsPaymentGatewayPayPal(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('PayPal 设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    PayPalClientId: '',
    PayPalClientSecret: '',
    PayPalWebhookId: '',
    PayPalSandboxClientId: '',
    PayPalSandboxClientSecret: '',
    PayPalSandboxWebhookId: '',
    PayPalProducts: '[]',
    PayPalTestMode: false,
    PayPalMinTopUp: 1,
    PayPalUnitPrice: 8.0,
    PayPalCurrency: 'USD',
  });
  const [originInputs, setOriginInputs] = useState({});
  const [products, setProducts] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    productId: '',
    price: 0,
    quota: 0,
    currency: 'USD',
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        PayPalClientId: props.options.PayPalClientId || '',
        PayPalClientSecret: props.options.PayPalClientSecret || '',
        PayPalWebhookId: props.options.PayPalWebhookId || '',
        PayPalSandboxClientId: props.options.PayPalSandboxClientId || '',
        PayPalSandboxClientSecret: props.options.PayPalSandboxClientSecret || '',
        PayPalSandboxWebhookId: props.options.PayPalSandboxWebhookId || '',
        PayPalProducts: props.options.PayPalProducts || '[]',
        PayPalTestMode: props.options.PayPalTestMode === 'true',
        PayPalMinTopUp: parseInt(props.options.PayPalMinTopUp) || 1,
        PayPalUnitPrice: parseFloat(props.options.PayPalUnitPrice) || 8.0,
        PayPalCurrency: props.options.PayPalCurrency || 'USD',
      };
      setInputs(currentInputs);
      setOriginInputs({ ...currentInputs });
      formApiRef.current.setValues(currentInputs);

      try {
        const parsedProducts = JSON.parse(currentInputs.PayPalProducts);
        setProducts(parsedProducts);
      } catch (e) {
        setProducts([]);
      }
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitPayPalSetting = async () => {
    setLoading(true);
    try {
      const options = [];

      if (inputs.PayPalClientId && inputs.PayPalClientId !== '') {
        options.push({ key: 'PayPalClientId', value: inputs.PayPalClientId });
      }

      if (inputs.PayPalClientSecret && inputs.PayPalClientSecret !== '') {
        options.push({
          key: 'PayPalClientSecret',
          value: inputs.PayPalClientSecret,
        });
      }

      if (inputs.PayPalWebhookId && inputs.PayPalWebhookId !== '') {
        options.push({
          key: 'PayPalWebhookId',
          value: inputs.PayPalWebhookId,
        });
      }

      if (inputs.PayPalSandboxClientId && inputs.PayPalSandboxClientId !== '') {
        options.push({
          key: 'PayPalSandboxClientId',
          value: inputs.PayPalSandboxClientId,
        });
      }

      if (inputs.PayPalSandboxClientSecret && inputs.PayPalSandboxClientSecret !== '') {
        options.push({
          key: 'PayPalSandboxClientSecret',
          value: inputs.PayPalSandboxClientSecret,
        });
      }

      if (inputs.PayPalSandboxWebhookId && inputs.PayPalSandboxWebhookId !== '') {
        options.push({
          key: 'PayPalSandboxWebhookId',
          value: inputs.PayPalSandboxWebhookId,
        });
      }

      options.push({
        key: 'PayPalTestMode',
        value: inputs.PayPalTestMode ? 'true' : 'false',
      });

      options.push({ key: 'PayPalProducts', value: JSON.stringify(products) });

      options.push({
        key: 'PayPalMinTopUp',
        value: String(inputs.PayPalMinTopUp || 1),
      });

      options.push({
        key: 'PayPalUnitPrice',
        value: String(inputs.PayPalUnitPrice || 8.0),
      });

      options.push({
        key: 'PayPalCurrency',
        value: inputs.PayPalCurrency || 'USD',
      });

      const requestQueue = options.map((opt) =>
        API.put('/api/option/', {
          key: opt.key,
          value: opt.value,
        }),
      );

      const results = await Promise.all(requestQueue);

      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => {
          showError(res.data.message);
        });
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

  const openProductModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({ ...product });
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        productId: '',
        price: 0,
        quota: 0,
        currency: 'USD',
      });
    }
    setShowProductModal(true);
  };

  const closeProductModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
    setProductForm({
      name: '',
      productId: '',
      price: 0,
      quota: 0,
      currency: 'USD',
    });
  };

  const saveProduct = () => {
    if (
      !productForm.name ||
      !productForm.productId ||
      productForm.price <= 0 ||
      productForm.quota <= 0 ||
      !productForm.currency
    ) {
      showError(t('请填写完整的产品信息'));
      return;
    }

    let newProducts = [...products];
    if (editingProduct) {
      const index = newProducts.findIndex(
        (p) => p.productId === editingProduct.productId,
      );
      if (index !== -1) {
        newProducts[index] = { ...productForm };
      }
    } else {
      if (newProducts.find((p) => p.productId === productForm.productId)) {
        showError(t('产品ID已存在'));
        return;
      }
      newProducts.push({ ...productForm });
    }

    setProducts(newProducts);
    closeProductModal();
  };

  const deleteProduct = (productId) => {
    const newProducts = products.filter((p) => p.productId !== productId);
    setProducts(newProducts);
  };

  const columns = [
    {
      title: t('产品名称'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('产品ID'),
      dataIndex: 'productId',
      key: 'productId',
    },
    {
      title: t('展示价格'),
      dataIndex: 'price',
      key: 'price',
      render: (price, record) =>
        `${record.currency === 'EUR' ? '€' : '$'}${price}`,
    },
    {
      title: t('充值额度'),
      dataIndex: 'quota',
      key: 'quota',
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <div className='flex gap-2'>
          <Button
            type='tertiary'
            size='small'
            onClick={() => openProductModal(record)}
          >
            {t('编辑')}
          </Button>
          <Button
            type='danger'
            theme='borderless'
            size='small'
            icon={<Trash2 size={14} />}
            onClick={() => deleteProduct(record.productId)}
          />
        </div>
      ),
    },
  ];

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
              <Form.Switch
                field='PayPalTestMode'
                label={t('沙盒模式')}
                extraText={t(inputs.PayPalTestMode ? '当前使用 Sandbox 环境' : '当前使用 Production 环境')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field='PayPalMinTopUp'
                label={t('最低充值额度')}
                min={1}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field='PayPalUnitPrice'
                label={t('汇率 (Unit Price)')}
                min={0}
                step={0.1}
                precision={2}
              />
            </Col>
          </Row>

          {inputs.PayPalTestMode ? (
            <>
              <Banner
                type='warning'
                description={t('当前为 Sandbox 模式，使用沙盒环境的 Client ID 和 Secret')}
                style={{ marginBottom: 16 }}
              />
              <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalSandboxClientId'
                    label={t('Sandbox Client ID')}
                    placeholder={t('PayPal Sandbox Client ID')}
                    type='password'
                  />
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalSandboxClientSecret'
                    label={t('Sandbox Client Secret')}
                    placeholder={t('PayPal Sandbox Client Secret')}
                    type='password'
                  />
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalSandboxWebhookId'
                    label={t('Sandbox Webhook ID')}
                    placeholder={t('PayPal Sandbox Webhook ID')}
                    type='password'
                  />
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Banner
                type='info'
                description={t('当前为 Production 模式，使用正式环境的 Client ID 和 Secret')}
                style={{ marginBottom: 16 }}
              />
              <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalClientId'
                    label={t('Production Client ID')}
                    placeholder={t('PayPal Client ID')}
                    type='password'
                  />
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalClientSecret'
                    label={t('Production Client Secret')}
                    placeholder={t('PayPal Client Secret')}
                    type='password'
                  />
                </Col>
                <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                  <Form.Input
                    field='PayPalWebhookId'
                    label={t('Production Webhook ID')}
                    placeholder={t('PayPal Webhook ID')}
                    type='password'
                  />
                </Col>
              </Row>
            </>
          )}

          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Select field='PayPalCurrency' label={t('默认货币')}>
                <Select.Option value='USD'>USD (美元)</Select.Option>
                <Select.Option value='EUR'>EUR (欧元)</Select.Option>
                <Select.Option value='GBP'>GBP (英镑)</Select.Option>
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
                  {props.options?.ServerAddress || 'https://api.vancine.com'}
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

          <div style={{ marginTop: 24 }}>
            <div className='flex justify-between items-center mb-4'>
              <Text strong>{t('产品配置')}</Text>
              <Button
                type='primary'
                icon={<Plus size={16} />}
                onClick={() => openProductModal()}
              >
                {t('添加产品')}
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={products}
              pagination={false}
              empty={
                <div className='text-center py-8'>
                  <Text type='tertiary'>{t('暂无产品配置')}</Text>
                </div>
              }
            />
          </div>

          <Button onClick={submitPayPalSetting} style={{ marginTop: 16 }}>
            {t('更新 PayPal 设置')}
          </Button>
        </Form.Section>
      </Form>

      <Modal
        title={editingProduct ? t('编辑产品') : t('添加产品')}
        visible={showProductModal}
        onOk={saveProduct}
        onCancel={closeProductModal}
        maskClosable={false}
        size='small'
        centered
      >
        <div className='space-y-4'>
          <div>
            <Text strong className='block mb-2'>
              {t('产品名称')}
            </Text>
            <Input
              value={productForm.name}
              onChange={(value) =>
                setProductForm({ ...productForm, name: value })
              }
              placeholder={t('例如：基础套餐')}
              size='large'
            />
          </div>
          <div>
            <Text strong className='block mb-2'>
              {t('产品ID')}
            </Text>
            <Input
              value={productForm.productId}
              onChange={(value) =>
                setProductForm({ ...productForm, productId: value })
              }
              placeholder={t('PayPal Product ID')}
              size='large'
              disabled={!!editingProduct}
            />
          </div>
          <div>
            <Text strong className='block mb-2'>
              {t('货币')}
            </Text>
            <Select
              value={productForm.currency}
              onChange={(value) =>
                setProductForm({ ...productForm, currency: value })
              }
              size='large'
              className='w-full'
            >
              <Select.Option value='USD'>{t('USD (美元)')}</Select.Option>
              <Select.Option value='EUR'>{t('EUR (欧元)')}</Select.Option>
              <Select.Option value='GBP'>{t('GBP (英镑)')}</Select.Option>
            </Select>
          </div>
          <div>
            <Text strong className='block mb-2'>
              {t('价格')} (
              {productForm.currency === 'EUR'
                ? t('欧元')
                : productForm.currency === 'GBP'
                  ? t('英镑')
                  : t('美元')}
              )
            </Text>
            <InputNumber
              value={productForm.price}
              onChange={(value) =>
                setProductForm({ ...productForm, price: value })
              }
              placeholder={t('例如：4.99')}
              min={0.01}
              precision={2}
              size='large'
              className='w-full'
            />
          </div>
          <div>
            <Text strong className='block mb-2'>
              {t('充值额度')}
            </Text>
            <InputNumber
              value={productForm.quota}
              onChange={(value) =>
                setProductForm({ ...productForm, quota: value })
              }
              placeholder={t('例如：100000')}
              min={1}
              precision={0}
              size='large'
              className='w-full'
            />
          </div>
        </div>
      </Modal>
    </Spin>
  );
}
