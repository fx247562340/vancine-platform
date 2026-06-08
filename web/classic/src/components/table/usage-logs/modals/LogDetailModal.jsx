/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useMemo } from 'react';
import { Modal, Typography, Tag, Collapse } from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
import { copy, showSuccess, showError } from '../../../../helpers';

const { Text } = Typography;

function formatJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

const CollapsibleBlock = ({ title, content, truncated, t }) => {
  const [expanded, setExpanded] = useState(false);
  const formatted = useMemo(() => formatJson(content), [content]);

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (await copy(formatted)) {
      showSuccess(t('已复制'));
    } else {
      showError(t('复制失败'));
    }
  };

  if (!content) return null;

  return (
    <Collapse>
      <Collapse.Panel
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong>{title}</Text>
            {truncated && (
              <Tag size='small' color='orange'>
                {t('已截断')}
              </Tag>
            )}
            <Text type='tertiary' size='small'>
              ({(content.length / 1024).toFixed(1)} KB)
            </Text>
          </div>
        }
        itemKey='1'
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              cursor: 'pointer',
              padding: 4,
            }}
            onClick={handleCopy}
          >
            <IconCopy />
          </div>
          <pre
            style={{
              maxHeight: 400,
              overflow: 'auto',
              fontSize: 12,
              fontFamily:
                'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--semi-color-fill-0)',
              padding: 12,
              borderRadius: 8,
              margin: 0,
            }}
          >
            {formatted}
          </pre>
        </div>
      </Collapse.Panel>
    </Collapse>
  );
};

const LogDetailModal = ({ visible, onCancel, record, t }) => {
  if (!record) return null;

  let other = {};
  try {
    other = typeof record.other === 'string' ? JSON.parse(record.other) : record.other || {};
  } catch {
    other = {};
  }

  const hasRequestBody = !!other.request_body;
  const hasResponseBody = !!other.response_body;
  const hasContent = !!record.content;

  return (
    <Modal
      title={t('请求详情')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      centered
      closable
      maskClosable
      width={720}
    >
      <div style={{ padding: '8px 20px 20px' }}>
        {/* 基本信息 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            fontSize: 12,
          }}
        >
          {record.request_id && (
            <Text type='tertiary'>
              {t('Request ID')}: {record.request_id}
            </Text>
          )}
          {other.request_path && (
            <Text type='tertiary'>
              {t('请求路径')}: {other.request_path}
            </Text>
          )}
          {record.model_name && (
            <Text type='tertiary'>
              {t('模型')}: {record.model_name}
            </Text>
          )}
        </div>

        {/* 请求体 */}
        {hasRequestBody && (
          <div style={{ marginBottom: 16 }}>
            <CollapsibleBlock
              title={t('请求参数')}
              content={other.request_body}
              truncated={other.request_body_truncated}
              t={t}
            />
          </div>
        )}

        {/* 响应体 */}
        {hasResponseBody && (
          <div style={{ marginBottom: 16 }}>
            <CollapsibleBlock
              title={t('响应内容')}
              content={other.response_body}
              truncated={other.response_body_truncated}
              t={t}
            />
          </div>
        )}

        {/* 原始内容 */}
        {hasContent && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('日志内容')}
            </Text>
            <div
              style={{
                background: 'var(--semi-color-fill-0)',
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {record.content}
            </div>
          </div>
        )}

        {/* 无数据提示 */}
        {!hasRequestBody && !hasResponseBody && !hasContent && (
          <Text type='tertiary'>{t('暂无详细信息')}</Text>
        )}
      </div>
    </Modal>
  );
};

export default LogDetailModal;
