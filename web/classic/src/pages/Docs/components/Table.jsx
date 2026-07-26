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
import C from '../constants';

const Table = ({ headers, rows, renderRow }) => (
  <div style={{
    border: `1px solid ${C.border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '16px',
  }}>
    <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: C.bg.light }}>
          {headers.map((h) => (
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
        {rows.map((row, i) => renderRow(row, i, i === rows.length - 1))}
      </tbody>
    </table>
  </div>
);

const Td = ({ children, style }) => (
  <td style={{ padding: '12px 16px', verticalAlign: 'top', ...style }}>{children}</td>
);

const Tr = ({ last, children }) => (
  <tr style={{ borderBottom: last ? 'none' : `1px solid ${C.border}` }}>{children}</tr>
);

export { Table, Td, Tr };
