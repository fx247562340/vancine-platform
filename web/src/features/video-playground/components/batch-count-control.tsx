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
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const MIN_VIDEO_BATCH = 1
const MAX_VIDEO_BATCH = 4

const BATCH_OPTIONS = Array.from(
  { length: MAX_VIDEO_BATCH - MIN_VIDEO_BATCH + 1 },
  (_, index) => MIN_VIDEO_BATCH + index
)

type BatchCountControlProps = {
  value: number
  onChange: (next: number) => void
}

export function BatchCountControl(props: BatchCountControlProps) {
  const { t } = useTranslation()
  return (
    <div className='flex items-center gap-2'>
      <p className='sr-only'>
        {t(
          'Each task is billed independently. Use small numbers when iterating.'
        )}
      </p>
      <span
        aria-hidden
        className='text-muted-foreground hidden text-xs lg:inline'
      >
        {t('Number of tasks')}
      </span>
      <ToggleGroup
        value={[String(props.value)]}
        onValueChange={(next) => {
          const selected = next.find((item) => item !== String(props.value))
          if (selected) props.onChange(Number(selected))
        }}
        aria-label={t('Number of tasks')}
        size='sm'
        spacing={1}
      >
        {BATCH_OPTIONS.map((option) => (
          <ToggleGroupItem key={option} value={String(option)}>
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
