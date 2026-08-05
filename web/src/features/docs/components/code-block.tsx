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
import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/ai-elements/code-block'
import { DOCS_NS } from '../i18n/loader'
import { copyToClipboard } from '../lib/clipboard'

interface DocsCopyButtonProps {
  code: string
  /** Icon-only (used as the CodeBlock overlay when there is no title bar). */
  iconOnly?: boolean
  className?: string
}

/**
 * Single Docs copy control. Every Docs copy path (titled bar, untitled
 * overlay, and code inside DocsCodeTabs) goes through this button, which calls
 * the production `copyToClipboard` helper — never navigator.clipboard directly.
 */
function DocsCopyButton(props: DocsCopyButtonProps) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    const ok = await copyToClipboard(props.code)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const label = copied
    ? t('common.copied', { defaultValue: '✓ Copied' })
    : t('common.copy', { defaultValue: 'Copy' })

  if (props.iconOnly) {
    const Icon = copied ? CheckIcon : CopyIcon
    return (
      <button
        type='button'
        onClick={() => void onClick()}
        aria-label={label}
        title={label}
        className={cn(
          'text-muted-foreground hover:text-foreground bg-background/80 cursor-pointer rounded-md p-1.5 transition-colors',
          props.className
        )}
      >
        <Icon size={14} aria-hidden='true' />
      </button>
    )
  }

  return (
    <button
      type='button'
      onClick={() => void onClick()}
      aria-label={label}
      className={cn(
        'text-muted-foreground hover:text-foreground cursor-pointer text-xs transition-colors',
        props.className
      )}
    >
      {label}
    </button>
  )
}

interface DocsCodeBlockProps {
  code: string
  title?: string
  language?: BundledLanguage
}

export function DocsCodeBlock(props: DocsCodeBlockProps) {
  const language = props.language ?? 'bash'

  return (
    <div className='mb-6'>
      {props.title && (
        <div className='border-border bg-muted/50 flex items-center justify-between rounded-t-md border border-b-0 px-4 py-2'>
          <span className='text-muted-foreground text-xs font-medium'>
            {props.title}
          </span>
          <DocsCopyButton code={props.code} />
        </div>
      )}
      <CodeBlock
        code={props.code}
        language={language}
        className={props.title ? 'rounded-t-none' : undefined}
      >
        {!props.title && <DocsCopyButton code={props.code} iconOnly />}
      </CodeBlock>
    </div>
  )
}
