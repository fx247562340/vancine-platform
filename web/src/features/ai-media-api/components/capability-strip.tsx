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
import {
  CubeIcon,
  Image01Icon,
  Video01Icon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { AI_MEDIA_CAPABILITIES } from '../lib/landing'

const CAPABILITY_ICONS: Record<string, IconSvgElement> = {
  'Image generation': Image01Icon,
  'Video generation': Video01Icon,
  'Text to Speech': VolumeHighIcon,
  '3D generation': CubeIcon,
}

/** Capability strip: text labels with icons, no provider logos. */
export function CapabilityStrip(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t(
        'Image, video, speech, and 3D generation—available with one API key.'
      )}
      className='border-border/40 border-y px-4 py-8 md:px-6'
    >
      <ul className='mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-4'>
        {AI_MEDIA_CAPABILITIES.map((capability) => (
          <li key={capability.titleKey} className='flex items-center gap-2'>
            <HugeiconsIcon
              icon={CAPABILITY_ICONS[capability.titleKey]}
              className='text-primary size-4'
              aria-hidden='true'
            />
            <span className='text-sm font-medium'>
              {t(capability.titleKey)}
            </span>
          </li>
        ))}
      </ul>
      <p className='text-muted-foreground mt-4 text-center text-sm'>
        {t(
          'Image, video, speech, and 3D generation—available with one API key.'
        )}
      </p>
    </section>
  )
}
