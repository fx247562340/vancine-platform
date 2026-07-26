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
import Badge from './Badge';

const ParamTable = ({ params }) => {
  const { t } = useTranslation('docs');
  const labels = {
    parameter: t('common.parameter'),
    type: t('common.type'),
    required: t('common.required'),
    description: t('common.description'),
    yes: t('common.yes'),
    no: t('common.no'),
  };

  return (
    <div style={{
      overflowX: 'auto',
      marginBottom: '24px',
      border: `1px solid ${C.border}`,
      borderRadius: '12px',
    }}>
      <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.bg.light }}>
            {[labels.parameter, labels.type, labels.required, labels.description].map((h) => (
              <th key={h} style={{
                textAlign: 'left',
                padding: '12px 16px',
                fontWeight: 600,
                color: C.text.body,
                borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {params.map(([name, type, req, desc], i) => (
            <tr key={i} style={{
              borderBottom: i < params.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <td style={{ padding: '12px 16px' }}>
                <code style={{
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: C.accent,
                  background: C.accentBg,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}>{name}</code>
              </td>
              <td style={{ padding: '12px 16px' }}><Badge color="gray">{type}</Badge></td>
              <td style={{ padding: '12px 16px' }}>
                {req ? <Badge color="red">{labels.yes}</Badge> : <Badge color="gray">{labels.no}</Badge>}
              </td>
              <td style={{ padding: '12px 16px', color: C.text.muted }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ParamTable;
