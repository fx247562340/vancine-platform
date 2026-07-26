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
import { Table, Td as TdCell, Tr } from '../components/Table';
import Badge from '../components/Badge';

const Errors = () => {
  const { t } = useTranslation('docs');

  const rows = [
    ['400', t('errors.codes.badRequest'), t('errors.codes.badRequestCause')],
    ['401', t('errors.codes.unauthorized'), t('errors.codes.unauthorizedCause')],
    ['404', t('errors.codes.notFound'), t('errors.codes.notFoundCause')],
    ['503', t('errors.codes.noChannel'), t('errors.codes.noChannelCause')],
  ];

  const errorResponse = `{
  "error": {
    "message": "The parameter size specified in the request is not valid",
    "type": "upstream_error",
    "param": "",
    "code": "InvalidParameter"
  }
}`;

  return (
    <div>
      <H2 id="errors-title">{t('errors.title')}</H2>
      <Table
        headers={[t('errors.colHttpStatus'), t('common.meaning'), t('errors.colTypicalCause')]}
        rows={rows}
        renderRow={([code, meaning, cause], i, last) => (
          <Tr key={i} last={last}>
            <TdCell><Badge color={code === '503' ? 'red' : 'orange'}>{code}</Badge></TdCell>
            <TdCell style={{ color: C.text.muted }}>{meaning}</TdCell>
            <TdCell style={{ color: C.text.subtle, fontSize: '13px' }}>{cause}</TdCell>
          </Tr>
        )}
      />

      <H3 id="errors-format">{t('errors.formatTitle')}</H3>
      <CodeBlock code={errorResponse} title="JSON" language="json" />
      <Callout type="info">{t('errors.asyncCallout')}</Callout>
    </div>
  );
};

export default Errors;
