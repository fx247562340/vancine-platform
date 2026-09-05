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

// Memory-only registry that binds a submitted video task to the SAME API
// key used for the submit call, so status polling and artifact fetches
// authenticate as that token. The key is never written to React state,
// localStorage, cookies, URLs, logs, or any persisted task data.
const keysByTaskId = new Map<string, string>()

export function rememberTaskApiKey(taskId: string, apiKey: string): void {
  keysByTaskId.set(taskId, apiKey)
}

export function lookupTaskApiKey(taskId: string): string | null {
  return keysByTaskId.get(taskId) ?? null
}

export function forgetTaskApiKey(taskId: string): void {
  keysByTaskId.delete(taskId)
}

// The video page owns every task key for its mount lifetime. When the user
// leaves the page we drop all of them at once so no full key survives the
// route change. Individual terminal tasks are already forgotten via
// forgetTaskApiKey; this clears whatever is still polling.
export function clearAllTaskApiKeys(): void {
  keysByTaskId.clear()
}
