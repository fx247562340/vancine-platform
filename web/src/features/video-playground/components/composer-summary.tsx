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
import {
  ArrowRight01Icon,
  MusicNote01Icon,
  MultiplicationSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { CREATION_MODE_LABELS } from '../lib/composition-labels'
import type { DurationMode } from '../lib/form-schema'
import type { CreationMode } from '../lib/mode'

type SummaryRowProps = {
  mode: CreationMode
  ratio: string
  resolution: string
  durationSeconds: number
  durationMode: DurationMode
  generateAudio: boolean
  batchCount: number
  outputFormat: string
  outputFps: number
}

/**
 * Visual summary of the request the next submit will send. The values
 * come from the form, not from a separate useState — so the
 * summary is always consistent with the body.
 */
export function ComposerSummary(props: SummaryRowProps) {
  const { t } = useTranslation()
  return (
    <ul className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
      <SummaryItem label={t(CREATION_MODE_LABELS[props.mode])} />
      <Sep />
      <SummaryItem label={`${props.ratio} · ${props.resolution}`} />
      <Sep />
      <SummaryItem
        label={
          props.durationMode === 'intelligent'
            ? t('Intelligent')
            : `${props.durationSeconds}s`
        }
      />
      <Sep />
      <SummaryItem
        icon={props.generateAudio ? MusicNote01Icon : MultiplicationSignIcon}
        label={props.generateAudio ? t('Audio on') : t('Silent')}
      />
      <Sep />
      <SummaryItem label={t('{{count}} task', { count: props.batchCount })} />
      <Sep />
      <SummaryItem
        label={`${props.outputFormat.toUpperCase()} · ${props.outputFps} fps`}
      />
    </ul>
  )
}

function Sep() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      aria-hidden
      data-icon='arrow'
      className='opacity-50'
    />
  )
}

function SummaryItem({
  icon: Icon,
  label,
}: {
  icon?: typeof MusicNote01Icon
  label: string
}) {
  return (
    <li className='flex items-center gap-1'>
      {Icon ? (
        <HugeiconsIcon icon={Icon} aria-hidden data-icon='summary' />
      ) : null}
      <span className='font-medium'>{label}</span>
    </li>
  )
}
