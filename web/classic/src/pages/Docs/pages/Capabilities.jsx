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
import { H2, P } from '../components/Headings';
import { Table, Td as TdCell, Tr } from '../components/Table';

const Capabilities = () => {
  const { t } = useTranslation('docs');

  const rows = [
    [t('capabilities.rows.chat'), 'POST /v1/chat/completions', t('capabilities.rows.chatNote')],
    [t('capabilities.rows.tts'), 'POST /v1/audio/speech', t('capabilities.rows.ttsNote')],
    [t('capabilities.rows.image'), 'POST /v1/images/generations', t('capabilities.rows.imageNote')],
    [t('capabilities.rows.video'), 'POST /v1/video/generations', t('capabilities.rows.videoNote')],
    [t('capabilities.rows.td'), 'POST /v1/video/generations', t('capabilities.rows.tdNote')],
  ];

  return (
    <div>
      <H2 id="capabilities-title">{t('capabilities.title')}</H2>
      <P>{t('capabilities.desc')}</P>
      <Table
        headers={[t('common.category'), t('common.endpoint'), t('common.notes')]}
        rows={rows}
        renderRow={([category, endpoint, notes], i, last) => (
          <Tr key={i} last={last}>
            <TdCell style={{ color: C.text.body, fontWeight: 600 }}>{category}</TdCell>
            <TdCell><code style={{ color: C.accent }}>{endpoint}</code></TdCell>
            <TdCell style={{ color: C.text.muted }}>{notes}</TdCell>
          </Tr>
        )}
      />
    </div>
  );
};

export default Capabilities;
