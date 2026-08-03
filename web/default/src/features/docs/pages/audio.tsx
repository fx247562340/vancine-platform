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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { DocsCallout } from '../components/callout'
import { DocsCodeTabs } from '../components/code-tabs'
import { DocsEndpoint } from '../components/endpoint'
import { DocsH2, DocsH3, DocsP } from '../components/headings'
import { DocsParamTable, type ParamRow } from '../components/param-table'
import { DocsTable, DocsTd, DocsTr } from '../components/primitives'
import { useRegisterHeadings } from '../components/register-headings'
import { buildCodeTabItems, type CodeTabSample } from '../lib/code-tabs'
import type { TocHeading } from '../types'

const CODE_LANGUAGES = {
  curl: 'bash',
  python: 'python',
  node: 'javascript',
} as const

type CodeTab = keyof typeof CODE_LANGUAGES
const CODE_TAB_ORDER: readonly CodeTab[] = ['curl', 'python', 'node']

// Voice data — 12 uranus (2.0) + 10 mars (1.0) = 22 total
// Each row: [voiceId, nameKey, model, useCaseKey]
// nameKey/useCaseKey are i18n keys: audio.voices.<key>
const VOICE_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['zh_female_vv_uranus_bigtts', 'vivi', '2.0', 'zhFemaleGentle'],
  ['en_female_nadia_uranus_bigtts', 'nadia', '2.0', 'enFemale'],
  ['en_female_jane_uranus_bigtts', 'jane', '2.0', 'enFemale'],
  ['en_female_rachel_p1_uranus_bigtts', 'rachel', '2.0', 'enFemale'],
  ['en_male_david_uranus_bigtts', 'david', '2.0', 'enMale'],
  ['en_male_alex_uranus_bigtts', 'alex', '2.0', 'enMale'],
  ['en_male_kevin_uranus_bigtts', 'kevin', '2.0', 'enMale'],
  ['en_female_stokie_uranus_bigtts', 'stokie', '2.0', 'enUkFemale'],
  ['es_female_bv084_uranus_bigtts', 'spanishFemale', '2.0', 'espanol'],
  ['fr_female_fr_bv078_uranus_bigtts', 'frenchFemale', '2.0', 'francais'],
  ['de_female_bv081_uranus_bigtts', 'germanFemale', '2.0', 'deutsch'],
  ['ar_female_dina_uranus_bigtts', 'arabicFemale', '2.0', 'arabic'],
  ['zh_female_cancan_mars_bigtts', 'cancan', '1.0', 'zhFemaleBright'],
  ['zh_male_wenhao_mars_bigtts', 'wenhao', '1.0', 'zhMaleSteady'],
  ['en_female_amanda_mars_bigtts', 'amanda', '1.0', 'enFemale'],
  ['en_female_emily_mars_bigtts', 'emily', '1.0', 'enFemale'],
  ['en_male_adam_mars_bigtts', 'adam', '1.0', 'enMale'],
  ['en_male_jackson_mars_bigtts', 'jackson', '1.0', 'enMale'],
  ['en_female_sarah_mars_bigtts', 'sarah', '1.0', 'enFemale'],
  ['en_male_smith_mars_bigtts', 'smith', '1.0', 'enMale'],
  ['en_female_anna_mars_bigtts', 'anna', '1.0', 'enFemale'],
  ['en_male_dryw_mars_bigtts', 'dryw', '1.0', 'enMale'],
]

function buildTtsSamples(
  baseUrl: string,
  model: string,
  voice: string
): Record<CodeTab, CodeTabSample> {
  return {
    curl: {
      label: 'cURL',
      code: `curl -X POST ${baseUrl}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "${model}",
    "input": "hello world",
    "voice": "${voice}"
  }' \\
  --output speech.mp3`,
    },
    python: {
      label: 'Python',
      code: `import requests

response = requests.post(
    "${baseUrl}/audio/speech",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json",
    },
    json={
        "model": "${model}",
        "input": "hello world",
        "voice": "${voice}",
    },
)

with open("speech.mp3", "wb") as f:
    f.write(response.content)`,
    },
    node: {
      label: 'Node.js',
      code: `import { writeFile } from "node:fs/promises";

const response = await fetch("${baseUrl}/audio/speech", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${model}",
    input: "hello world",
    voice: "${voice}",
  }),
});

const audio = Buffer.from(await response.arrayBuffer());
await writeFile("speech.mp3", audio);`,
    },
  }
}

export default function AudioPage(props: { baseUrl: string }) {
  const { t } = useTranslation('docs', { useSuspense: false })
  const baseUrl = props.baseUrl

  useRegisterHeadings(
    useMemo<TocHeading[]>(
      () => [
        { id: 'audio-title', title: t('audio.title'), level: 2 },
        { id: 'audio-params', title: t('audio.paramsTitle'), level: 3 },
        {
          id: 'audio-tts-examples',
          title: t('audio.ttsExamplesTitle'),
          level: 3,
        },
        {
          id: 'audio-tts2-examples',
          title: t('audio.tts2ExamplesTitle'),
          level: 3,
        },
        { id: 'audio-voices', title: t('audio.voicesTitle'), level: 3 },
      ],
      [t]
    )
  )

  const ttsSamples = useMemo<Record<CodeTab, CodeTabSample>>(
    () =>
      buildTtsSamples(baseUrl, 'Doubao-tts', 'zh_female_cancan_mars_bigtts'),
    [baseUrl]
  )

  const tts2Samples = useMemo<Record<CodeTab, CodeTabSample>>(
    () =>
      buildTtsSamples(baseUrl, 'Doubao-tts2.0', 'zh_female_vv_uranus_bigtts'),
    [baseUrl]
  )

  const ttsItems = useMemo(
    () => buildCodeTabItems(ttsSamples, CODE_TAB_ORDER, CODE_LANGUAGES),
    [ttsSamples]
  )

  const tts2Items = useMemo(
    () => buildCodeTabItems(tts2Samples, CODE_TAB_ORDER, CODE_LANGUAGES),
    [tts2Samples]
  )

  const params = useMemo<ParamRow[]>(
    () => [
      {
        name: 'model',
        type: 'string',
        required: true,
        description: t('audio.params.model'),
      },
      {
        name: 'input',
        type: 'string',
        required: true,
        description: t('audio.params.input'),
      },
      {
        name: 'voice',
        type: 'string',
        required: true,
        description: t('audio.params.voice'),
      },
      {
        name: 'response_format',
        type: 'string',
        required: false,
        description: t('audio.params.response_format'),
      },
      {
        name: 'speed',
        type: 'number',
        required: false,
        description: t('audio.params.speed'),
      },
    ],
    [t]
  )

  return (
    <div>
      <DocsH2 id='audio-title'>{t('audio.title')}</DocsH2>
      <DocsEndpoint method='POST' path='/v1/audio/speech' />
      <DocsP>{t('audio.desc')}</DocsP>

      <DocsH3 id='audio-params'>{t('audio.paramsTitle')}</DocsH3>
      <DocsParamTable params={params} />

      <DocsCallout type='warning'>{t('audio.endpointWarning')}</DocsCallout>

      <DocsH3 id='audio-tts-examples'>{t('audio.ttsExamplesTitle')}</DocsH3>
      <DocsCodeTabs items={ttsItems} />

      <DocsH3 id='audio-tts2-examples'>{t('audio.tts2ExamplesTitle')}</DocsH3>
      <DocsCodeTabs items={tts2Items} />

      <DocsH3 id='audio-voices'>{t('audio.voicesTitle')}</DocsH3>
      <DocsCallout type='info'>{t('audio.voiceSuffixCallout')}</DocsCallout>
      <DocsTable
        headers={[
          t('audio.colVoiceId'),
          t('audio.colName'),
          t('audio.colModel'),
          t('audio.colUseCase'),
        ]}
      >
        {VOICE_ROWS.map(([voiceId, nameKey, model, useCaseKey], i) => (
          <DocsTr key={voiceId} last={i === VOICE_ROWS.length - 1}>
            <DocsTd>
              <code className='text-primary font-mono text-[13px]'>
                {voiceId}
              </code>
            </DocsTd>
            <DocsTd>{t(`audio.voices.${nameKey}`)}</DocsTd>
            <DocsTd>
              <Badge
                variant={model.includes('2.0') ? 'default' : 'secondary'}
                className={
                  model.includes('2.0')
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : undefined
                }
              >
                {model}
              </Badge>
            </DocsTd>
            <DocsTd className='text-muted-foreground'>
              {t(`audio.voices.${useCaseKey}`)}
            </DocsTd>
          </DocsTr>
        ))}
      </DocsTable>
    </div>
  )
}
