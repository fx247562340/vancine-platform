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

import React, { useContext, useEffect, useState } from 'react';
import { Button, Typography, Input } from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { IconCopy, IconPlay, IconFile } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import NoticeModal from '../../components/layout/NoticeModal';
import {
  Moonshot, OpenAI, XAI, Zhipu, Volcengine, Cohere,
  Claude, Gemini, Suno, Minimax, Wenxin, Spark,
  Qingyan, DeepSeek, Qwen, Midjourney, Grok,
  AzureAI, Hunyuan, Xinference,
} from '@lobehub/icons';

const { Text } = Typography;

const features = [
  {
    icon: '🎬',
    title: 'Video Generation',
    titleZh: '视频生成',
    desc: 'Generate stunning videos from text or images with Wan, Kling, and more.',
    descZh: '使用 Wan、Kling 等模型，从文本或图片生成高质量视频。',
    models: 'Wan 2.2 · Kling · Hailuo',
    color: 'bg-semi-color-primary-light-default dark:bg-semi-color-primary-light-default',
  },
  {
    icon: '🎨',
    title: 'Image Generation',
    titleZh: '图片生成',
    desc: 'Create high-quality images with FLUX, Qwen-Image, Seedream, and more.',
    descZh: '使用 FLUX、Qwen-Image、Seedream 等模型生成高质量图片。',
    models: 'FLUX · Qwen-Image · Seedream',
    color: 'bg-semi-color-tertiary-light-default dark:bg-semi-color-tertiary-light-default',
  },
  {
    icon: '🧠',
    title: 'LLM API',
    titleZh: '大语言模型',
    desc: 'Access the best Chinese LLMs through a single OpenAI-compatible endpoint.',
    descZh: '通过统一的 OpenAI 兼容接口访问最强大的中文大语言模型。',
    models: 'DeepSeek V4 · Qwen 3.6 · GLM 5.1',
    color: 'bg-semi-color-success-light-default dark:bg-semi-color-success-light-default',
  },
  {
    icon: '🎵',
    title: 'Music Generation',
    titleZh: '音乐生成',
    desc: 'Compose full songs with vocals and instruments from text descriptions.',
    descZh: '从文本描述生成完整的歌曲，包含人声和乐器。',
    models: 'Suno · Udio',
    color: 'bg-semi-color-warning-light-default dark:bg-semi-color-warning-light-default',
  },
];

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const isMobile = useIsMobile();
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const isChinese = i18n.language.startsWith('zh');

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;
    if (success) {
      let content = data;
      if (!data.startsWith('https://')) {
        content = marked.parse(data);
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);
      if (data.startsWith('https://')) {
        const iframe = document.querySelector('iframe');
        if (iframe) {
          iframe.onload = () => {
            iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
            iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
          };
        }
      }
    } else {
      showError(message);
    }
    setHomePageContentLoaded(true);
  };

  const handleCopyBaseURL = async () => {
    const ok = await copy(serverAddress);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  useEffect(() => {
    const checkNoticeAndShow = async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate !== today) {
        try {
          const res = await API.get('/api/notice');
          const { success, data } = res.data;
          if (success && data && data.trim() !== '') {
            setNoticeVisible(true);
          }
        } catch (error) {
          console.error('Failed to fetch notice:', error);
        }
      }
    };
    checkNoticeAndShow();
  }, []);

  useEffect(() => {
    displayHomePageContent();
  }, []);

  return (
    <div className='w-full overflow-x-hidden'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />
      {homePageContentLoaded && homePageContent === '' ? (
        <div className='w-full overflow-x-hidden'>
          {/* ========== Hero Section ========== */}
          <div
            className='relative w-full min-h-[600px] md:min-h-[700px] flex items-center justify-center overflow-hidden'
            style={{
              background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 40%, #00B894 100%)',
            }}
          >
            {/* Dot pattern overlay */}
            <div
              className='absolute inset-0 opacity-10'
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '40px 40px',
              }}
            />

            <div className='relative z-10 max-w-[1200px] mx-auto px-6 text-center text-white py-20'>
              {/* Badge */}
              <div className='inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-sm font-medium'>
                <span className='w-2 h-2 rounded-full bg-green-300 animate-pulse' />
                {t('Now available — Chinese AI models for global developers')}
              </div>

              {/* Headline */}
              <h1 className='text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 tracking-tight'>
                One API,
                <br />
                <span
                  className='bg-clip-text text-transparent'
                  style={{
                    backgroundImage: 'linear-gradient(to right, #55EFC4, #FDCB6E)',
                  }}
                >
                  Infinite Creativity
                </span>
              </h1>

              {/* Subheadline */}
              <p className='text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed'>
                {t('Generate videos, images, music, and text with the best AI models — at a fraction of the cost.')}
              </p>

              {/* CTAs */}
              <div className='flex flex-col sm:flex-row items-center justify-center gap-4 mb-12'>
                <Link to='/console'>
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-xl !font-semibold !px-8 !py-3'
                    style={{ backgroundColor: '#fff', color: '#6C5CE7', border: 'none' }}
                    icon={<IconPlay />}
                  >
                    {t('Get Started Free')}
                  </Button>
                </Link>
                {docsLink && (
                  <Button
                    size={isMobile ? 'default' : 'large'}
                    className='!rounded-xl !font-semibold !px-8 !py-3'
                    style={{ backgroundColor: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.4)' }}
                    icon={<IconFile />}
                    onClick={() => window.open(docsLink, '_blank')}
                  >
                    {t('Documentation')}
                  </Button>
                )}
              </div>

              {/* Base URL */}
              <div className='max-w-lg mx-auto'>
                <Input
                  readonly
                  value={serverAddress}
                  className='!rounded-xl !bg-white/15 !border-white/20 !text-white placeholder:!text-white/50'
                  size={isMobile ? 'default' : 'large'}
                  suffix={
                    <Button
                      type='primary'
                      onClick={handleCopyBaseURL}
                      icon={<IconCopy />}
                      className='!rounded-lg'
                      size='small'
                    />
                  }
                />
              </div>

              {/* Stats */}
              <div className='mt-12 flex flex-wrap items-center justify-center gap-8 md:gap-16 text-white/70'>
                <div className='text-center'>
                  <div className='text-3xl font-bold text-white'>20+</div>
                  <div className='text-sm mt-1'>{t('AI Models')}</div>
                </div>
                <div className='w-px h-10 bg-white/20 hidden md:block' />
                <div className='text-center'>
                  <div className='text-3xl font-bold text-white'>3-10x</div>
                  <div className='text-sm mt-1'>{t('Cheaper')}</div>
                </div>
                <div className='w-px h-10 bg-white/20 hidden md:block' />
                <div className='text-center'>
                  <div className='text-3xl font-bold text-white'>1</div>
                  <div className='text-sm mt-1'>{t('Unified API')}</div>
                </div>
              </div>
            </div>

            {/* Bottom fade */}
            <div className='absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-semi-color-bg-0 to-transparent' />
          </div>

          {/* ========== Features Section ========== */}
          <div id='features' className='py-20 px-6'>
            <div className='max-w-[1200px] mx-auto'>
              <div className='text-center mb-14'>
                <span className='inline-block px-3 py-1 mb-4 text-xs font-semibold uppercase tracking-wider text-semi-color-primary bg-semi-color-primary-light-default rounded-full'>
                  Features
                </span>
                <h2 className='text-3xl md:text-4xl font-bold text-semi-color-text-0 mb-4'>
                  {t('Everything you need in one API')}
                </h2>
                <p className='text-lg text-semi-color-text-1 max-w-2xl mx-auto'>
                  {t('No more juggling multiple providers. Access the best AI models through a single, unified interface.')}
                </p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {features.map((f) => (
                  <div
                    key={f.title}
                    className={`group p-7 rounded-2xl border border-semi-color-border hover:border-semi-color-primary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${f.color}`}
                  >
                    <div className='text-3xl mb-4'>{f.icon}</div>
                    <h3 className='text-xl font-semibold text-semi-color-text-0 mb-2'>
                      {isChinese ? f.titleZh : f.title}
                    </h3>
                    <p className='text-semi-color-text-1 leading-relaxed mb-3'>
                      {isChinese ? f.descZh : f.desc}
                    </p>
                    <p className='text-xs font-medium text-semi-color-text-2 uppercase tracking-wider'>
                      {f.models}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ========== Providers Section ========== */}
          <div className='py-16 px-6 border-t border-semi-color-border'>
            <div className='max-w-[1200px] mx-auto text-center'>
              <Text type='tertiary' className='text-lg md:text-xl font-light block mb-8'>
                {t('支持众多的大模型供应商')}
              </Text>
              <div className='flex flex-wrap items-center justify-center gap-4 sm:gap-5 md:gap-6 max-w-4xl mx-auto'>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Moonshot size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><OpenAI size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><XAI size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Zhipu.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Volcengine.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Cohere.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Claude.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Gemini.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Suno size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Minimax.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Wenxin.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Spark.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Qingyan.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><DeepSeek.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Qwen.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Midjourney size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Grok size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><AzureAI.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Hunyuan.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity'><Xinference.Color size={36} /></div>
                <div className='w-10 h-10 md:w-12 md:h-12 flex items-center justify-center'>
                  <Text className='text-xl md:text-2xl font-bold text-semi-color-text-2'>30+</Text>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className='overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              className='w-full h-screen border-none'
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
