/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your later version).

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import { Table, Td as TdCell, Tr } from '../components/Table';
import Badge from '../components/Badge';

const TEXT_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'Doubao-Seed-2.0-Code',
  'Doubao-Seed-2.0-pro',
  'Doubao-Seed-2.1-pro',
  'Doubao-Seed-2.1-turbo',
  'glm-5.1',
  'glm-5.2',
  'kimi-k2.5',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k3',
  'LongCat-2.0',
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M3',
  'qwen3.5-omni-flash',
  'qwen3.6-plus',
  'qwen3.7-max',
  'qwen3.7-plus',
];

const IMAGE_MODELS = [
  ['qwen-image-2.0', '1024x1024', ''],
  ['qwen-image-2.0-pro', '1024x1024', '2K'],
  ['Doubao-Seedream-5.0-pro', '1K / 2K / WxH', '921,600 ~ 4,624,220 px'],
  ['Doubao-Seedream-5.0-lite', '2K / 3K / 4K / WxH', '≥ 3,686,400 px'],
  ['wan2.7-image', 'WxH', ''],
  ['wan2.7-image-pro', 'WxH', ''],
];

const VIDEO_MODELS = [
  ['Doubao-Seedance-1.5-pro', '¥0.24 / call', '~37s in verification'],
  ['Doubao-Seedance-2.0-fast', '¥0.55 / call', 'async generation'],
  ['Doubao-Seedance-2.0', '¥0.68 / call', 'async generation'],
];

const THREE_D_MODELS = [
  ['Hyper3D-Gen2', 'images optional', 'text or image reference'],
  ['Hitem3D-2.0', 'images optional', 'image reference recommended'],
  ['Doubao-Seed3D-2.0', 'images required', 'image-to-3D only'],
];

const Models = ({ baseUrl }) => {
  const { t } = useTranslation('docs');

  // Derive pricingUrl from baseUrl
  const pricingUrl = baseUrl.replace(/\/v1$/i, '/api/pricing');

  const multimodalRows = [
    ...IMAGE_MODELS.map(([m, size, note]) => [m, 'image', note || size]),
    ...VIDEO_MODELS.map(([m, price, note]) => [m, 'video', `${price}; ${note}`]),
    ...THREE_D_MODELS.map(([m, input, state]) => [m, '3D', `${input}; ${state}`]),
    ['Doubao-tts', 'audio', t('models.returnsValidMp3')],
    ['Doubao-tts2.0', 'audio', t('models.returnsValidMp3')],
  ];

  return (
    <div>
      <H2 id="models-title">{t('models.title')}</H2>
      <P>{t('models.desc')}</P>
      <CodeBlock code={`curl ${pricingUrl}`} title={t('models.fetchPricing')} language="bash" />

      <H3 id="models-text">{t('models.textModelsTitle', { count: TEXT_MODELS.length })}</H3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
        {TEXT_MODELS.map((model) => <Badge key={model} color="blue">{model}</Badge>)}
      </div>

      <H3 id="models-multimodal">{t('models.multimodalTitle')}</H3>
      <Table
        headers={[t('common.model'), t('models.colType'), t('models.colUsageNotes')]}
        rows={multimodalRows}
        renderRow={([model, type, note], i, last) => (
          <Tr key={i} last={last}>
            <TdCell style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{model}</TdCell>
            <TdCell><Badge color={type === 'image' ? 'green' : type === 'video' ? 'purple' : type === '3D' ? 'orange' : 'gray'}>{type}</Badge></TdCell>
            <TdCell style={{ color: C.text.muted }}>{note}</TdCell>
          </Tr>
        )}
      />
    </div>
  );
};

export default Models;
