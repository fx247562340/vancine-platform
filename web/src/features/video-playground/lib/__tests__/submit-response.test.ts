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
import { describe, expect, it } from 'vitest'

import { parseVideoSubmitTaskId } from '../submit-response'

describe('parseVideoSubmitTaskId', () => {
  it('reads task_id when only task_id is present', () => {
    expect(parseVideoSubmitTaskId({ task_id: 'task-abc' })).toBe('task-abc')
  })

  it('reads id when only id is present', () => {
    expect(parseVideoSubmitTaskId({ id: 'task-from-id' })).toBe('task-from-id')
  })

  it('prefers task_id when both public identifiers are present', () => {
    expect(
      parseVideoSubmitTaskId({ id: 'legacy-id', task_id: 'public-task' })
    ).toBe('public-task')
  })

  it('rejects a response without a public task id', () => {
    expect(() => parseVideoSubmitTaskId({ status: 'queued' })).toThrow()
    expect(() => parseVideoSubmitTaskId({ id: 12 })).toThrow()
    expect(() => parseVideoSubmitTaskId({ task_id: '' })).toThrow()
  })
})
