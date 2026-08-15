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
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PromptInputSpeechButton } from '../prompt-input'

/**
 * Array-like `results` fixture for the speech-recognition event.
 *
 * It intentionally provides ONLY the array-like surface (`length`, numeric
 * indices, `item`) and deliberately does NOT provide `[Symbol.iterator]`,
 * mirroring the project's local `SpeechRecognitionResultList` contract so the
 * component can only rely on array-like access.
 */
interface MockAlternative {
  transcript: string
}

interface MockResult {
  readonly isFinal: boolean
  0: MockAlternative
}

interface MockResults {
  readonly length: number
  item(index: number): MockResult | undefined
  [index: number]: MockResult | undefined
}

interface MockResultEvent {
  results: MockResults
}

function createResults(
  entries: Array<{ isFinal: boolean; transcript: string }>
): MockResults {
  const results: MockResults = {
    length: entries.length,
    item(index: number) {
      return this[index]
    },
  }
  for (let index = 0; index < entries.length; index += 1) {
    results[index] = {
      isFinal: entries[index].isFinal,
      0: { transcript: entries[index].transcript },
    }
  }
  return results
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = []

  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onresult: ((event: MockResultEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  start = vi.fn()
  stop = vi.fn()

  constructor() {
    MockSpeechRecognition.instances.push(this)
  }
}

beforeEach(() => {
  MockSpeechRecognition.instances = []
  vi.stubGlobal('SpeechRecognition', MockSpeechRecognition)
})

afterEach(() => {
  vi.unstubAllGlobals()
  MockSpeechRecognition.instances = []
})

describe('PromptInputSpeechButton transcription', () => {
  it('ignores interim results, concatenates final transcripts in index order, and appends to the textarea with a single space', () => {
    const textareaRef = createRef<HTMLTextAreaElement>()
    const onTranscriptionChange = vi.fn()
    render(
      <>
        <textarea ref={textareaRef} defaultValue='existing' />
        <PromptInputSpeechButton
          textareaRef={textareaRef}
          onTranscriptionChange={onTranscriptionChange}
        />
      </>
    )

    const recognition = MockSpeechRecognition.instances[0]
    expect(recognition).toBeDefined()
    expect(recognition.onresult).not.toBeNull()

    const results = createResults([
      { isFinal: false, transcript: 'partial-' },
      { isFinal: true, transcript: 'hello' },
      { isFinal: true, transcript: 'world' },
    ])
    // The fixture must not provide an iterator: the component may only use
    // array-like access (length + numeric indices).
    expect(Symbol.iterator in results).toBe(false)

    expect(() => recognition.onresult?.({ results })).not.toThrow()

    // interim transcript is not part of the final value
    expect(screen.getByRole('textbox')).toHaveValue('existing helloworld')
    expect(onTranscriptionChange).toHaveBeenCalledTimes(1)
    expect(onTranscriptionChange).toHaveBeenCalledWith('existing helloworld')
  })

  it('appends without a leading space when the textarea is empty', () => {
    const textareaRef = createRef<HTMLTextAreaElement>()
    const onTranscriptionChange = vi.fn()
    render(
      <>
        <textarea ref={textareaRef} defaultValue='' />
        <PromptInputSpeechButton
          textareaRef={textareaRef}
          onTranscriptionChange={onTranscriptionChange}
        />
      </>
    )

    const recognition = MockSpeechRecognition.instances[0]
    expect(recognition).toBeDefined()

    const results = createResults([
      { isFinal: true, transcript: 'hello' },
      { isFinal: true, transcript: 'world' },
    ])

    expect(() => recognition.onresult?.({ results })).not.toThrow()

    expect(screen.getByRole('textbox')).toHaveValue('helloworld')
    expect(onTranscriptionChange).toHaveBeenCalledTimes(1)
    expect(onTranscriptionChange).toHaveBeenCalledWith('helloworld')
  })
})
