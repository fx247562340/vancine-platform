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

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import C from '../constants';
import { H2, H3, P } from '../components/Headings';
import CodeBlock from '../components/CodeBlock';
import Callout from '../components/Callout';

const AGENT_CLI_CONFIGS = [
  {
    nameKey: 'codex',
    title: 'Codex CLI',
    codeTemplate: (baseUrl) => `# ~/.codex/config.toml
model = "glm-5.1"
model_provider = "vancine"

[model_providers.vancine]
name = "Vancine"
base_url = "${baseUrl}"
env_key = "VANCINE_API_KEY"
wire_api = "responses"

# shell
# export VANCINE_API_KEY="sk-your-api-key"`,
  },
  {
    nameKey: 'opencode',
    title: 'OpenCode',
    codeTemplate: (baseUrl) => `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vancine": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vancine",
      "options": {
        "baseURL": "${baseUrl}",
        "apiKey": "{env:VANCINE_API_KEY}"
      },
      "models": {
        "glm-5.1": {
          "name": "GLM 5.1",
          "limit": { "context": 128000, "output": 8192 }
        },
        "deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash",
          "limit": { "context": 128000, "output": 8192 }
        }
      }
    }
  }
}`,
  },
  {
    nameKey: 'openclaw',
    title: 'OpenClaw',
    codeTemplate: (baseUrl) => `Provider: OpenAI Compatible
Base URL: ${baseUrl}
API Key: sk-your-api-key
Model: glm-5.1

# If the tool supports environment variables:
VANCINE_BASE_URL=${baseUrl}
VANCINE_API_KEY=sk-your-api-key
VANCINE_MODEL=glm-5.1`,
  },
  {
    nameKey: 'hermes',
    title: 'Hermes Agent',
    codeTemplate: (baseUrl) => `# ~/.hermes/config.yaml
openai_compatible:
  base_url: "${baseUrl}"
  api_key: "sk-your-api-key"
  model: "glm-5.1"

# or environment variables
export OPENAI_COMPATIBLE_BASE_URL="${baseUrl}"
export OPENAI_COMPATIBLE_API_KEY="sk-your-api-key"`,
  },
];

const AGENT_GUI_TOOLS = ['cursor', 'cline', 'cherryStudio'];

const Agents = ({ baseUrl }) => {
  const { t } = useTranslation('docs');

  const agentConfigs = useMemo(() =>
    AGENT_CLI_CONFIGS.map((agent) => ({
      ...agent,
      code: agent.codeTemplate(baseUrl),
      note: t(`agents.cli.${agent.nameKey}`),
    })),
    [baseUrl, t]
  );

  return (
    <div>
      <H2 id="agents-title">{t('agents.title')}</H2>
      <P>{t('agents.desc')}</P>

      <Callout type="tip">{t('agents.universalTip', { baseUrl })}</Callout>

      {agentConfigs.map((agent) => (
        <div key={agent.nameKey} style={{ marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: C.text.h1 }}>{agent.title}</h3>
          <p style={{ fontSize: '14px', color: C.text.muted, lineHeight: 1.7, marginBottom: '12px' }}>{agent.note}</p>
          <CodeBlock code={agent.code} title={t('agents.configExample')} language="bash" />
        </div>
      ))}

      <H3 id="agents-gui">{t('agents.guiTitle')}</H3>
      {AGENT_GUI_TOOLS.map((toolKey) => (
        <div key={toolKey} style={{ marginBottom: '24px', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: C.text.h1 }}>{t(`agents.gui.${toolKey}.title`)}</h3>
          <ol style={{ listStyle: 'decimal', paddingLeft: '20px', lineHeight: 2, fontSize: '14px', color: C.text.muted }}>
            {[1, 2, 3, 4, 5].map((step) => {
              const stepKey = `agents.gui.${toolKey}.step${step}`;
              const stepText = t(stepKey, { baseUrl });
              // If translation returns the key itself (missing), skip it
              if (stepText === stepKey) return null;
              return <li key={step}>{stepText}</li>;
            }).filter(Boolean)}
          </ol>
        </div>
      ))}
    </div>
  );
};

export default Agents;
