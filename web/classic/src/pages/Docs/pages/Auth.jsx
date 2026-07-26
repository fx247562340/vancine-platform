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
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import Callout from '../components/Callout';

const Auth = () => {
  const { t } = useTranslation('docs');

  return (
    <div>
      <H2 id="auth-title">{t('auth.title')}</H2>
      <P>{t('auth.desc')}</P>
      <CodeBlock code="Authorization: Bearer sk-your-api-key" title="HTTP Header" language="bash" />
      <Callout type="warning">{t('auth.securityWarning')}</Callout>
    </div>
  );
};

export default Auth;
