/*
Copyright (C) 2023-2026 QuantumNous

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
import { useState, useRef, useCallback } from 'react'
import {
  XIcon,
  PaperclipIcon,
  FileIcon,
  ImageIcon,
  SendIcon,
  SquareIcon,
  BarChartIcon,
  BoxIcon,
  NotepadTextIcon,
  CodeSquareIcon,
  GraduationCapIcon,
  Loader2Icon,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { uploadImage } from '../api'
import type { ModelOption, GroupOption } from '../types'

interface PlaygroundInputProps {
  onSubmit: (text: string, images?: string[]) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  showImageUpload?: boolean
}

/**
 * A pasted/selected image on its way into a request. `previewUrl` is a
 * local base64 data URL for instant thumbnails; `httpUrl` is the public
 * URL returned by /api/upload/image once the upload settles.
 */
interface ImageAttachment {
  id: string
  name: string
  previewUrl: string
  httpUrl?: string
  status: 'uploading' | 'ready' | 'error'
}

const suggestions = [
  { icon: BarChartIcon, text: 'Analyze data', color: '#76d0eb' },
  { icon: BoxIcon, text: 'Surprise me', color: '#76d0eb' },
  { icon: NotepadTextIcon, text: 'Summarize text', color: '#ea8444' },
  { icon: CodeSquareIcon, text: 'Code', color: '#6c71ff' },
  { icon: GraduationCapIcon, text: 'Get advice', color: '#76d0eb' },
  { icon: null, text: 'More' },
]

export function PlaygroundInput({
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  showImageUpload = false,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [imageUrlInput, setImageUrlInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const isModelSelectDisabled =
    disabled || isModelLoading || models.length === 0
  const isGroupSelectDisabled = disabled || groups.length === 0

  // Shared ingest for paste, file picker and drag-less flows: instant base64
  // preview + background upload to /api/upload/image for the request URL.
  const addFiles = useCallback(
    (files: Array<File | null | undefined>) => {
      files.forEach((file) => {
        if (!file) return
        if (!file.type.startsWith('image/')) return
        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('Image size must be less than 10MB'))
          return
        }
        const id = nanoid()
        const reader = new FileReader()
        reader.onload = () => {
          const previewUrl = reader.result as string
          setAttachments((prev) => [
            ...prev,
            { id, name: file.name, previewUrl, status: 'uploading' },
          ])
          uploadImage(file)
            .then((url) => {
              setAttachments((prev) =>
                prev.map((attachment) =>
                  attachment.id === id
                    ? { ...attachment, httpUrl: url, status: 'ready' }
                    : attachment
                )
              )
            })
            .catch(() => {
              setAttachments((prev) =>
                prev.map((attachment) =>
                  attachment.id === id
                    ? { ...attachment, status: 'error' }
                    : attachment
                )
              )
              toast.error(t('Upload failed'))
            })
        }
        reader.readAsDataURL(file)
      })
    },
    [t]
  )

  // Paste anywhere in the input area: only image clipboard items trigger an
  // upload; text pastes keep their default behavior.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (imageFiles.length === 0) return
      event.preventDefault()
      addFiles(imageFiles)
    },
    [addFiles]
  )

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      addFiles(Array.from(files))
      // reset input so same file can be selected again
      e.target.value = ''
    },
    [addFiles]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const addImageUrl = useCallback(() => {
    const url = imageUrlInput.trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      setAttachments((prev) => [
        ...prev,
        {
          id: nanoid(),
          name: url,
          previewUrl: url,
          httpUrl: url,
          status: 'ready',
        },
      ])
      setImageUrlInput('')
    }
  }, [imageUrlInput])

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text?.trim() || disabled) return
    // Only successfully uploaded HTTP URLs are attached to requests
    const httpImages = attachments
      .filter(
        (attachment): attachment is ImageAttachment & { httpUrl: string } =>
          attachment.status === 'ready' && !!attachment.httpUrl
      )
      .map((attachment) => attachment.httpUrl)
    onSubmit(message.text, httpImages.length > 0 ? httpImages : undefined)
    setText('')
    setAttachments([])
  }

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit(suggestion)
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4' onPaste={handlePaste}>
      {/* Hidden inputs behind the attach menu. Both feed the image upload
          pipeline; non-image files picked via "Upload file" are filtered
          out by addFiles (only image uploads are supported for now). */}
      <input
        ref={fileInputRef}
        type='file'
        multiple
        className='hidden'
        onChange={handleImageUpload}
      />
      <input
        ref={imageInputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={handleImageUpload}
      />

      {/* Attachment previews (paste / file picker / URL) */}
      {attachments.length > 0 && (
        <div className='flex gap-2 overflow-x-auto px-2 py-1'>
          {attachments.map((attachment) => (
            <div key={attachment.id} className='group relative shrink-0'>
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className={cn(
                  'h-16 w-16 rounded-lg border object-cover',
                  attachment.status === 'error' &&
                    'border-destructive opacity-60'
                )}
              />
              {attachment.status === 'uploading' && (
                <div className='absolute inset-0 flex items-center justify-center rounded-lg bg-black/50'>
                  <Loader2Icon className='animate-spin text-white' size={18} />
                  <span className='sr-only'>{t('Uploading')}</span>
                </div>
              )}
              <button
                type='button'
                aria-label={t('Remove image')}
                onClick={() => removeAttachment(attachment.id)}
                className='bg-background/80 absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border text-xs opacity-0 group-hover:opacity-100'
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image URL input for 3D models */}
      {showImageUpload && (
        <div className='flex items-center gap-2 px-2'>
          <input
            type='text'
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addImageUrl()
              }
            }}
            placeholder={t('Paste image URL and press Enter')}
            className='border-input bg-background flex-1 rounded-md border px-3 py-1.5 text-sm'
            disabled={disabled}
          />
          <button
            type='button'
            onClick={addImageUrl}
            disabled={!imageUrlInput.trim()}
            className='bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm disabled:opacity-50'
          >
            {t('Add')}
          </button>
        </div>
      )}

      <PromptInput groupClassName='rounded-xl' onSubmit={handleSubmit}>
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='px-5 md:text-base'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='p-2.5'>
          <PromptInputTools>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    className='border font-medium'
                    disabled={disabled}
                    variant='outline'
                  />
                }
              >
                <PaperclipIcon size={16} />
                <span className='hidden sm:inline'>{t('Attach')}</span>
                <span className='sr-only sm:hidden'>{t('Attach')}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileIcon className='mr-2' size={16} />
                  {t('Upload file')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className='mr-2' size={16} />
                  {t('Upload photo')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PromptInputTools>

          <div className='flex items-center gap-1.5 md:gap-2'>
            <ModelGroupSelector
              selectedModel={modelValue}
              models={models}
              onModelChange={onModelChange}
              selectedGroup={groupValue}
              groups={groups}
              onGroupChange={onGroupChange}
              disabled={isModelSelectDisabled || isGroupSelectDisabled}
            />

            {isGenerating && onStop ? (
              <PromptInputButton
                className='text-foreground font-medium'
                onClick={onStop}
                variant='secondary'
              >
                <SquareIcon className='fill-current' size={16} />
                <span className='hidden sm:inline'>{t('Stop')}</span>
                <span className='sr-only sm:hidden'>{t('Stop')}</span>
              </PromptInputButton>
            ) : (
              <PromptInputButton
                className='text-foreground font-medium'
                disabled={disabled || !text.trim()}
                type='submit'
                variant='secondary'
              >
                <SendIcon size={16} />
                <span className='hidden sm:inline'>{t('Send')}</span>
                <span className='sr-only sm:hidden'>{t('Send')}</span>
              </PromptInputButton>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>

      <Suggestions>
        {suggestions.map(({ icon: Icon, text, color }) => (
          <Suggestion
            className={`text-xs font-normal sm:text-sm ${
              text === 'More' ? 'hidden sm:flex' : ''
            }`}
            key={text}
            onClick={() => handleSuggestionClick(text)}
            suggestion={text}
          >
            {Icon && <Icon size={16} style={{ color }} />}
            {text}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  )
}
