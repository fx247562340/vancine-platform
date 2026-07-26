/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your later version).

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import Callout from '../components/Callout';
import Tabs from '../components/Tabs';
import ParamTable from '../components/ParamTable';
import Endpoint from '../components/Endpoint';
import { Table, Td, Tr } from '../components/Table';
import Badge from '../components/Badge';

// Voice data — 12 uranus (2.0) + 10 mars (1.0) = 22 total
// Each: [voiceId, nameKey, model, usecaseKey]
// nameKey/usecaseKey are i18n keys: audio.voices.<key>
const VOICE_ROWS = [
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
];

const Audio = ({ baseUrl }) => {
  const { t } = useTranslation('docs');
  const [ttsTab, setTtsTab] = useState('curl');
  const [tts2Tab, setTts2Tab] = useState('curl');

  const ttsSamples = useMemo(() => ({
    curl: {
      label: 'cURL',
      code: `curl -X POST ${baseUrl}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "Doubao-tts",
    "input": "hello world",
    "voice": "zh_female_cancan_mars_bigtts"
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
        "model": "Doubao-tts",
        "input": "hello world",
        "voice": "zh_female_cancan_mars_bigtts",
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
    model: "Doubao-tts",
    input: "hello world",
    voice: "zh_female_cancan_mars_bigtts",
  }),
});

const audio = Buffer.from(await response.arrayBuffer());
await writeFile("speech.mp3", audio);`,
    },
  }), [baseUrl]);

  const tts2Samples = useMemo(() => ({
    curl: {
      label: 'cURL',
      code: `curl -X POST ${baseUrl}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "Doubao-tts2.0",
    "input": "hello world",
    "voice": "zh_female_vv_uranus_bigtts"
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
        "model": "Doubao-tts2.0",
        "input": "hello world",
        "voice": "zh_female_vv_uranus_bigtts",
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
    model: "Doubao-tts2.0",
    input: "hello world",
    voice: "zh_female_vv_uranus_bigtts",
  }),
});

const audio = Buffer.from(await response.arrayBuffer());
await writeFile("speech.mp3", audio);`,
    },
  }), [baseUrl]);

  const ttsTabs = [
    { key: 'curl', label: ttsSamples.curl.label },
    { key: 'python', label: ttsSamples.python.label },
    { key: 'node', label: ttsSamples.node.label },
  ];

  const tts2Tabs = [
    { key: 'curl', label: tts2Samples.curl.label },
    { key: 'python', label: tts2Samples.python.label },
    { key: 'node', label: tts2Samples.node.label },
  ];

  const params = [
    ['model', 'string', true, t('audio.params.model')],
    ['input', 'string', true, t('audio.params.input')],
    ['voice', 'string', true, t('audio.params.voice')],
  ];

  return (
    <div>
      <H2 id="audio-title">{t('audio.title')}</H2>
      <Endpoint method="POST" path="/v1/audio/speech" />
      <P>{t('audio.desc')}</P>

      <H3 id="audio-params">{t('audio.paramsTitle')}</H3>
      <ParamTable params={params} />

      <Callout type="warning">{t('audio.endpointWarning')}</Callout>

      <H3 id="audio-tts-examples">{t('audio.ttsExamplesTitle')}</H3>
      <Tabs tabs={ttsTabs} active={ttsTab} onChange={setTtsTab} />
      <CodeBlock
        code={ttsSamples[ttsTab].code}
        language={ttsTab === 'curl' ? 'bash' : ttsTab === 'python' ? 'python' : 'javascript'}
      />

      <H3 id="audio-tts2-examples">{t('audio.tts2ExamplesTitle')}</H3>
      <Tabs tabs={tts2Tabs} active={tts2Tab} onChange={setTts2Tab} />
      <CodeBlock
        code={tts2Samples[tts2Tab].code}
        language={tts2Tab === 'curl' ? 'bash' : tts2Tab === 'python' ? 'python' : 'javascript'}
      />

      <H3 id="audio-voices">{t('audio.voicesTitle')}</H3>
      <Callout type="info">{t('audio.voiceSuffixCallout')}</Callout>
      <Table
        headers={[t('audio.colVoiceId'), t('audio.colName'), t('audio.colModel'), t('audio.colUseCase')]}
        rows={VOICE_ROWS}
        renderRow={([vid, nameKey, model, usecaseKey], i, last) => (
          <Tr key={i} last={last}>
            <Td style={{ fontFamily: 'monospace', color: C.accent, fontSize: '13px' }}>{vid}</Td>
            <Td style={{ color: C.text.body }}>{t(`audio.voices.${nameKey}`)}</Td>
            <Td><Badge color={model.includes('2.0') ? 'green' : 'gray'}>{model}</Badge></Td>
            <Td style={{ color: C.text.muted }}>{t(`audio.voices.${usecaseKey}`)}</Td>
          </Tr>
        )}
      />
    </div>
  );
};

export default Audio;
