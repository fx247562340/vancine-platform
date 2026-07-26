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
import Callout from '../components/Callout';
import ParamTable from '../components/ParamTable';
import Endpoint from '../components/Endpoint';
import { Table, Td as TdCell, Tr } from '../components/Table';
import Badge from '../components/Badge';

const THREE_D_MODELS = [
  ['Hyper3D-Gen2', 'images optional', 'text or image reference'],
  ['Hitem3D-2.0', 'images optional', 'image reference recommended'],
  ['Doubao-Seed3D-2.0', 'images required', 'image-to-3D only'],
];

const Td = ({ baseUrl }) => {
  const { t } = useTranslation('docs');

  const params = [
    ['model', 'string', true, t('td.params.model')],
    ['prompt', 'string', true, t('td.params.prompt')],
    ['images', 'array', false, t('td.params.images')],
  ];

  return (
    <div>
      <H2 id="td-title">{t('td.title')}</H2>
      <Endpoint method="POST" path="/v1/video/generations" desc={t('td.endpointSubmit')} />
      <Endpoint method="GET" path="/v1/video/generations/{task_id}" desc={t('td.endpointPoll')} />
      <P>{t('td.desc')}</P>

      <H3 id="td-models">{t('td.modelsTitle')}</H3>
      <Table
        headers={[t('common.model'), t('td.colImagesParam'), t('common.notes')]}
        rows={THREE_D_MODELS}
        renderRow={([model, input, state], i, last) => (
          <Tr key={i} last={last}>
            <TdCell style={{ fontFamily: 'monospace', color: C.accent }}>{model}</TdCell>
            <TdCell style={{ color: C.text.muted }}>{input}</TdCell>
            <TdCell><Badge color="orange">{state}</Badge></TdCell>
          </Tr>
        )}
      />

      <H3 id="td-params">{t('td.paramsTitle')}</H3>
      <ParamTable params={params} />

      <H3 id="td-examples">{t('td.examplesTitle')}</H3>
      <CodeBlock
        code={`{
  "model": "Hyper3D-Gen2",
  "prompt": "a simple cube"
}`}
        language="json"
        title={t('td.withoutImage')}
      />
      <CodeBlock
        code={`{
  "model": "Doubao-Seed3D-2.0",
  "prompt": "turn this reference into a clean 3D asset",
  "images": ["https://example.com/reference.png"]
}`}
        language="json"
        title={t('td.withImage')}
      />

      <Callout type="warning">{t('td.imagesWarning')}</Callout>
    </div>
  );
};

export default Td;
