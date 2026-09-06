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

import { Button } from '@/components/ui/button'

import type { GenericVideoCapability } from '../lib/capabilities'
import type { ResourceStore as UseResourceStore } from '../lib/use-resource-store'
import { ResourceAdder } from './resource-adder'
import { ResourceChipList } from './resource-chip-list'

type GenericReferenceAssetsRowProps = {
  capability: GenericVideoCapability
  resourceStore: UseResourceStore
}

/**
 * Reference tray for a video model without a dedicated capability profile.
 *
 * Only the one substantiated input is offered: a single public HTTPS image URL
 * for image-to-video. There is no local-file picker, no asset-library id, no
 * video adder and no audio adder, because none of those has a verified contract
 * on an unknown model.
 *
 * The chips are inert. `@Image1`-style tokens are how the dedicated Seedance
 * prompt cites an attached asset; a generic model instead receives its image in
 * the top-level `image` field, so a token here would name a syntax the request
 * never carries. The chip keeps its name and its remove button.
 *
 * Assets the user attached under a previous, dedicated model are still listed as
 * chips and stay removable. They are never dropped behind the user's back: the
 * serializer rejects the submission until the user clears them.
 */
export function GenericReferenceAssetsRow(
  props: GenericReferenceAssetsRowProps
) {
  const { t } = useTranslation()
  const { capability, resourceStore } = props
  const hasResources =
    resourceStore.images.length > 0 ||
    resourceStore.videos.length > 0 ||
    resourceStore.audios.length > 0

  return (
    <div
      role='group'
      aria-label={t('Reference assets')}
      className='border-border/60 bg-muted/20 flex flex-col gap-2.5 rounded-xl border border-dashed p-3'
    >
      <div className='flex flex-col gap-1.5'>
        <ResourceAdder
          supportedFormats={capability.referenceImage.supportedFormats}
          kind='image'
          count={resourceStore.images.length}
          maxCount={capability.referenceImage.maxCount}
          onAdd={resourceStore.addImage}
          onLocalFile={async () => null}
          acceptsLocalFile={false}
          acceptsAssetId={false}
          buttonLabelKey='Add image'
          buttonAriaLabelKey='Add reference image'
          urlPlaceholderKey='https://cdn.example.com/reference.png'
          triggerClassName='w-full justify-start'
        />
        {hasResources ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='w-full justify-start'
            onClick={() => resourceStore.reset()}
            aria-label={t('Clear all references')}
          >
            {t('Clear all')}
          </Button>
        ) : null}
      </div>
      <ResourceChipList
        images={resourceStore.images}
        videos={resourceStore.videos}
        audios={resourceStore.audios}
        onRemove={(id, kind) => {
          if (kind === 'image') resourceStore.removeImage(id)
          else if (kind === 'video') resourceStore.removeVideo(id)
          else resourceStore.removeAudio(id)
        }}
        referenceMode={{ kind: 'inert' }}
      />
    </div>
  )
}
