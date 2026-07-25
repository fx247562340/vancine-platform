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

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Tag } from '@douyinfe/semi-ui';
import { Rocket, MessageSquare, Key, Terminal, Copy, X } from 'lucide-react';
import { showSuccess } from '../../helpers';

const GettingStartedCard = ({ CARD_PROPS, FLEX_CENTER_GAP2, t, userId }) => {
  const navigate = useNavigate();
  const dismissKey = `getting_started_dismissed_${userId}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissKey) === '1',
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const baseUrl = window.location.origin;
  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{"model": "deepseek-v4-flash", "messages": [{"role": "user", "content": "Hello!"}]}'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlExample).then(() => {
      showSuccess(t('已复制到剪贴板'));
    });
  };

  const steps = [
    {
      icon: <MessageSquare size={18} className='text-blue-500' />,
      title: t('试用 Playground'),
      desc: t('无需配置，直接在浏览器中对话测试模型效果'),
      action: () => navigate('/console/playground'),
      actionText: t('开始对话'),
    },
    {
      icon: <Key size={18} className='text-amber-500' />,
      title: t('获取 API Key'),
      desc: t('创建令牌，用于 SDK 或应用集成调用'),
      action: () => navigate('/console/token'),
      actionText: t('创建令牌'),
    },
    {
      icon: <Terminal size={18} className='text-green-500' />,
      title: t('发起第一次请求'),
      desc: t('兼容 OpenAI SDK，复制下方命令即可运行'),
      action: handleCopyCurl,
      actionText: t('复制命令'),
    },
  ];

  return (
    <Card
      {...CARD_PROPS}
      className='bg-indigo-50 border-0 !rounded-2xl mb-4'
      title={
        <div className={FLEX_CENTER_GAP2}>
          <Rocket size={16} className='text-indigo-500' />
          <span>{t('快速上手')}</span>
          <Tag size='small' color='indigo' shape='circle'>
            3 min
          </Tag>
        </div>
      }
      headerExtraContent={
        <Button
          theme='borderless'
          icon={<X size={14} />}
          size='small'
          onClick={handleDismiss}
          aria-label={t('关闭引导')}
        />
      }
    >
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
        {steps.map((step, idx) => (
          <div
            key={idx}
            className='flex flex-col p-4 bg-white/70 rounded-xl border border-gray-100'
          >
            <div className='flex items-center gap-2 mb-2'>
              <span className='flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-bold text-gray-500'>
                {idx + 1}
              </span>
              {step.icon}
              <span className='text-sm font-semibold text-gray-800'>
                {step.title}
              </span>
            </div>
            <p className='text-xs text-gray-500 mb-3 flex-1'>{step.desc}</p>
            <Button
              size='small'
              theme='solid'
              className='mt-2 self-start !rounded-lg'
              onClick={step.action}
            >
              {step.actionText}
            </Button>
          </div>
        ))}
      </div>
      <div className='rounded-xl border border-gray-100 overflow-hidden'>
        <div className='flex items-center justify-between px-4 py-2 bg-white/70'>
          <span className='text-xs text-gray-500 font-mono'>bash</span>
          <Button
            theme='borderless'
            size='small'
            icon={<Copy size={14} />}
            onClick={handleCopyCurl}
            aria-label={t('复制命令')}
          />
        </div>
        <pre className='p-4 m-0 bg-gray-900 text-green-300 text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed'>
          {curlExample}
        </pre>
      </div>
    </Card>
  );
};

export default GettingStartedCard;
