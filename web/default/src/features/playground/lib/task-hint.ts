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
/**
 * Default theme route for the task logs section (usage logs → task).
 */
export const TASK_LOGS_PATH = '/usage-logs/task'

export interface TaskHintLabels {
  /** e.g. t('Task submitted, task ID:') */
  submittedLabel: string
  /** e.g. t('Go to Task Logs to check progress and results.') */
  hintLabel: string
}

/**
 * Build the persisted/copiable text for a submitted async task message.
 * The chat UI renders a richer hint (with a router link) from
 * `message.taskInfo`; this text keeps the same information copyable.
 */
export function buildTaskSubmittedContent(
  taskId: string,
  labels: TaskHintLabels
): string {
  return `✅ ${labels.submittedLabel} ${taskId}\n\n${labels.hintLabel}\n${TASK_LOGS_PATH}`
}
