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
// Run with: node --test src/features/playground/lib/task-hint.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { TASK_LOGS_PATH, buildTaskSubmittedContent } from './task-hint.ts'

describe('task submission hint content', () => {
  test('contains the task id', () => {
    const content = buildTaskSubmittedContent('task-abc-123', {
      submittedLabel: 'Task submitted, task ID:',
      hintLabel: 'Go to Task Logs to check progress and results.',
    })
    assert.ok(content.includes('task-abc-123'))
  })

  test('contains the task logs path so copied text keeps the link target', () => {
    const content = buildTaskSubmittedContent('task-1', {
      submittedLabel: 'Task submitted, task ID:',
      hintLabel: 'Go to Task Logs to check progress and results.',
    })
    assert.ok(content.includes(TASK_LOGS_PATH))
    assert.equal(TASK_LOGS_PATH, '/usage-logs/task')
  })

  test('uses the provided translated labels', () => {
    const content = buildTaskSubmittedContent('t-9', {
      submittedLabel: 'LABEL_A',
      hintLabel: 'LABEL_B',
    })
    assert.ok(content.includes('LABEL_A'))
    assert.ok(content.includes('LABEL_B'))
  })
})
