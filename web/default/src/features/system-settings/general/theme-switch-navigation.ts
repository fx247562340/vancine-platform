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
 * Theme switch navigation decision logic and settings submit orchestration.
 *
 * ## themeNavigationFromChangedFields
 *
 * Determines the post-save navigation action by inspecting
 * `changedFields['theme.frontend']`. This key is present in
 * `changedFields` only when the user's submitted value differs from
 * the saved baseline (computed by `useSettingsForm`). Its value is the
 * **new** theme the user selected.
 *
 *   - `changedFields['theme.frontend'] === 'classic'`
 *       → full document request to `/console/setting`
 *   - `changedFields['theme.frontend'] === 'default'`
 *       → `window.location.reload()` to fetch Default assets
 *   - key absent (theme unchanged)
 *       → no navigation
 *
 * ## assertOptionSuccess
 *
 * Throws on `{success: false}` so that `useSettingsForm.handleSubmit`
 * does NOT reset dirty state / baseline.
 *
 * ## executeSettingsSubmit
 *
 * Pure orchestration that saves every changed field, asserts success
 * (throwing on failure to prevent baseline reset), then **returns**
 * the navigation action. The caller is responsible for executing the
 * navigation AFTER `useSettingsForm` has reset the form (clearing
 * `isDirty`), so that `FormNavigationGuard` does not block the
 * full-document navigation.
 *
 * On failure (transport or business), the function throws, preventing
 * `useSettingsForm` from reaching the post-submit `form.reset()`.
 * This keeps dirty state intact and no navigation action is returned.
 */

export type ThemeNavigationAction =
  | { type: 'none' }
  | { type: 'reload' }
  | { type: 'navigate'; url: string }

/**
 * Determine the theme navigation action from `changedFields`.
 *
 * The key insight: `changedFields` only contains `theme.frontend` when
 * the submitted value differs from the saved baseline. Its value is the
 * new theme. We do NOT need the previous theme at all.
 */
export function themeNavigationFromChangedFields(
  changedFields: Record<string, unknown>
): ThemeNavigationAction {
  const themeValue = changedFields['theme.frontend']

  if (themeValue === 'classic') {
    return { type: 'navigate', url: '/console/setting' }
  }

  if (themeValue === 'default') {
    return { type: 'reload' }
  }

  // theme.frontend absent from changedFields, or some unexpected value
  return { type: 'none' }
}

/**
 * Assert that a server option-update response indicates success.
 * Throws with the server's error message on business failure.
 * Transport failures already throw via `mutateAsync`.
 */
export function assertOptionSuccess(response: {
  success: boolean
  message: string
}): void {
  if (!response.success) {
    throw new Error(response.message || 'Setting update failed')
  }
}

/** Shape of the update function passed to executeSettingsSubmit. */
export type OptionUpdater = (request: {
  key: string
  value: string
}) => Promise<{ success: boolean; message: string }>

/**
 * Execute the settings save loop: iterate changed fields, save each,
 * assert success (throwing on failure). Returns the navigation action
 * to execute AFTER the form resets (clearing `isDirty`).
 *
 * The caller must:
 *   1. Store the returned action in a ref.
 *   2. Let `useSettingsForm` complete its post-submit `form.reset()`.
 *   3. In a `useEffect` triggered by `isDirty` becoming `false`,
 *      execute the pending action and clear the ref.
 *
 * On failure, this function throws, so no action is returned and
 * `useSettingsForm` does not reach `form.reset()`.
 */
export async function executeSettingsSubmit(
  changedFields: Record<string, unknown>,
  updateOption: OptionUpdater,
  normalizeValue: (v: unknown) => string,
  normalizeServerAddress: (v: string) => string
): Promise<ThemeNavigationAction> {
  for (const [key, value] of Object.entries(changedFields)) {
    let v = normalizeValue(value)
    if (key === 'ServerAddress') {
      v = normalizeServerAddress(v)
    }

    const result = await updateOption({ key, value: v })

    // Throws on {success: false}. This rejects the onSubmit promise,
    // which prevents useSettingsForm from resetting dirty state and
    // baseline. Transport failures already throw naturally.
    assertOptionSuccess(result)
  }

  // Only reached if every changed field succeeded.
  return themeNavigationFromChangedFields(changedFields)
}
