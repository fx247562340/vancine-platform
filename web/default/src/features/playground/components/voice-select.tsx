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
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getVoiceOptions, isAudioSpeechModel } from '../lib/audio-models'

interface VoiceSelectProps {
  model: string
  value: string
  onChange: (voice: string) => void
  disabled?: boolean
}

/**
 * TTS voice selector. Renders nothing for non-audio models; the option
 * list follows the model generation (uranus for 2.0, mars for 1.0).
 */
export function VoiceSelect({
  model,
  value,
  onChange,
  disabled,
}: VoiceSelectProps) {
  const { t } = useTranslation()

  if (!isAudioSpeechModel(model)) {
    return null
  }

  const options = getVoiceOptions(model)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  return (
    <div className='flex items-center gap-2 px-2'>
      <span className='text-sm font-medium'>{t('Voice')}</span>
      <Select
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string' && next) onChange(next)
        }}
      >
        <SelectTrigger className='w-72 max-w-full'>
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
