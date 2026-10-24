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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import {
  isKimiK31ModelId,
  KIMI_K31_MODELS,
  type KimiK31ModelId,
} from '../lib/landing'

export function ModelChoice(props: {
  modelId: KimiK31ModelId
  onModelChange: (modelId: KimiK31ModelId) => void
  idPrefix: string
}): ReactElement {
  const { t } = useTranslation()

  return (
    <fieldset className='w-full max-w-xl'>
      <legend className='text-sm font-medium'>
        {t('Choose a Kimi K3.1 model')}
      </legend>
      <RadioGroup
        value={props.modelId}
        onValueChange={(value) => {
          if (isKimiK31ModelId(value)) props.onModelChange(value)
        }}
        aria-label={t('Choose a Kimi K3.1 model')}
        className='mt-3 grid gap-2 sm:grid-cols-2'
      >
        {KIMI_K31_MODELS.map((model) => (
          <div
            key={model.id}
            className='border-border bg-card flex items-start gap-3 rounded-lg border p-3'
          >
            <RadioGroupItem
              value={model.id}
              id={`${props.idPrefix}-${model.id}`}
              data-testid={`${props.idPrefix}-${model.id}`}
            />
            <Label
              htmlFor={`${props.idPrefix}-${model.id}`}
              className='grid gap-1'
            >
              <span>{t(model.labelKey)}</span>
              <span className='text-muted-foreground font-mono text-xs font-normal'>
                {model.id}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
