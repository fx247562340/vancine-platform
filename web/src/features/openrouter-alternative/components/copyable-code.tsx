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

For commercial licensing, please contact support@quantumnous.com.
*/
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

type CopyStatus = 'idle' | 'copied' | 'error'

const COPY_FEEDBACK_RESET_MS = 2000

export interface CopyableCodeProps {
  /** The exact code text offered to the clipboard. */
  code: string
  /** Localized, visible label identifying the example (used in aria). */
  label: string
}

/**
 * A read-only code block with a copy button. Copy feedback is exposed
 * both visually (icon switch) and through an aria-live region, so
 * success and failure are announced to assistive technology alike.
 *
 * The implementation is intentionally local to this feature so the
 * /openrouter-alternative page keeps an independent test surface
 * and a stable, user-visible contract.
 */
export function CopyableCode(props: CopyableCodeProps): ReactElement {
  const { t } = useTranslation()
  const [status, setStatus] = useState<CopyStatus>('idle')
  const statusId = useId()
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current)
      }
    }
  }, [])

  const handleCopy = async (): Promise<void> => {
    const success = await copyToClipboard(props.code)
    setStatus(success ? 'copied' : 'error')
    if (resetTimer.current) {
      clearTimeout(resetTimer.current)
    }
    resetTimer.current = setTimeout(() => {
      setStatus('idle')
    }, COPY_FEEDBACK_RESET_MS)
  }

  const feedbackByStatus: Record<Exclude<CopyStatus, 'idle'>, string> = {
    copied: t('Code copied'),
    error: t('Unable to copy code'),
  }
  const feedback = status === 'idle' ? '' : feedbackByStatus[status]

  return (
    <div className='relative'>
      <pre className='bg-muted/60 border-border max-h-96 overflow-auto rounded-lg border p-4 pr-14 text-xs leading-relaxed'>
        <code>{props.code}</code>
      </pre>
      <Button
        variant='outline'
        size='icon-sm'
        className='absolute top-2 right-2'
        onClick={handleCopy}
        aria-label={`${t('Copy example code to clipboard')} (${props.label})`}
        aria-describedby={statusId}
      >
        <HugeiconsIcon
          icon={status === 'copied' ? Tick02Icon : Copy01Icon}
          data-icon='inline-start'
          aria-hidden='true'
        />
      </Button>
      <p id={statusId} aria-live='polite' className='sr-only'>
        {feedback}
      </p>
    </div>
  )
}
