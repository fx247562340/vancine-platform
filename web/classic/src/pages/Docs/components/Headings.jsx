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

const H2 = ({ children, id }) => (
  <h2
    id={id}
    style={{
      fontSize: '24px',
      fontWeight: 700,
      marginBottom: '8px',
      color: C.text.h1,
      scrollMarginTop: '80px',
    }}
  >
    {children}
  </h2>
);

const H3 = ({ children, id }) => (
  <h3
    id={id}
    style={{
      fontSize: '18px',
      fontWeight: 600,
      marginBottom: '8px',
      marginTop: '24px',
      color: C.text.h1,
      scrollMarginTop: '80px',
    }}
  >
    {children}
  </h3>
);

const P = ({ children }) => (
  <p style={{ color: C.text.muted, marginBottom: '16px', lineHeight: 1.7 }}>{children}</p>
);

export { H2, H3, P };
