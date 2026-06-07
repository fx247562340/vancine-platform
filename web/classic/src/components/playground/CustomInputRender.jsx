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

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Toast, Spin } from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { usePlayground } from '../../contexts/PlaygroundContext';
import { uploadImage } from '../../helpers/api';

const CustomInputRender = (props) => {
  const { t } = useTranslation();
  const { onPasteImage, onRemoveImage, imageUrls, imageEnabled } =
    usePlayground();
  const { detailProps } = props;
  const { clearContextNode, uploadNode, inputNode, sendNode, onClick } =
    detailProps;
  const containerRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handlePaste = useCallback(
    async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = item.getAsFile();

          if (file) {
            try {
              setUploading(true);
              // 同时读取 base64 和上传获取 HTTP URL
              const reader = new FileReader();
              const base64Promise = new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              const base64 = await base64Promise;

              const data = await uploadImage(file);
              if (data && data.url) {
                onPasteImage(data.url, base64);
                Toast.success({
                  content: t('图片已上传'),
                  duration: 2,
                });
              } else {
                Toast.error({
                  content: t('上传失败'),
                  duration: 2,
                });
              }
            } catch (error) {
              console.error('Failed to upload image:', error);
              Toast.error({
                content: t('图片上传失败'),
                duration: 2,
              });
            } finally {
              setUploading(false);
            }
          }
          break;
        }
      }
    },
    [onPasteImage, t],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('paste', handlePaste);
    return () => {
      container.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  // 过滤出有效的图片 URL
  const validImages = (imageUrls || []).filter(
    (url) => url && url.trim() !== '',
  );

  // 清空按钮
  const styledClearNode = clearContextNode
    ? React.cloneElement(clearContextNode, {
        className: `!rounded-full !bg-gray-100 hover:!bg-red-500 hover:!text-white flex-shrink-0 transition-all ${clearContextNode.props.className || ''}`,
        style: {
          ...clearContextNode.props.style,
          width: '32px',
          height: '32px',
          minWidth: '32px',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      })
    : null;

  // 发送按钮
  const styledSendNode = React.cloneElement(sendNode, {
    className: `!rounded-full !bg-purple-500 hover:!bg-purple-600 flex-shrink-0 transition-all ${sendNode.props.className || ''}`,
    style: {
      ...sendNode.props.style,
      width: '32px',
      height: '32px',
      minWidth: '32px',
      padding: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

  return (
    <div className='p-2 sm:p-4' ref={containerRef}>
      {/* 图片预览区 */}
      {(validImages.length > 0 || uploading) && (
        <div className='flex items-center gap-2 mb-2 px-2 flex-wrap'>
          {validImages.map((url, index) => (
            <div key={index} className='relative group'>
              <img
                src={url}
                alt={`attachment-${index}`}
                className='w-12 h-12 object-cover rounded-lg border border-gray-200'
              />
              <button
                onClick={() => onRemoveImage(index)}
                className='absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'
                style={{ fontSize: '10px', lineHeight: 1 }}
              >
                <IconClose size='extra-small' />
              </button>
            </div>
          ))}
          {uploading && (
            <div className='w-12 h-12 flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50'>
              <Spin size='small' />
            </div>
          )}
        </div>
      )}

      <div
        className='flex items-center gap-2 sm:gap-3 p-2 bg-gray-50 rounded-xl sm:rounded-2xl shadow-sm hover:shadow-md transition-shadow'
        style={{ border: '1px solid var(--semi-color-border)' }}
        onClick={onClick}
        title={t('支持 Ctrl+V 粘贴图片')}
      >
        {/* 清空对话按钮 - 左边 */}
        {styledClearNode}
        <div className='flex-1'>{inputNode}</div>
        {/* 发送按钮 - 右边 */}
        {styledSendNode}
      </div>
    </div>
  );
};

export default CustomInputRender;
