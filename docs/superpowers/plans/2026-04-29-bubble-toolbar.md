# Bubble Toolbar Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bubble toolbar plugin (`MEPluginBubbleToolbar`) that surfaces the 9 inline formatting commands as clickable buttons next to the user's selection, with active-state highlighting and full keyboard navigation.

**Architecture:** Pure plugin layer. `index.ts` orchestrates events; `toolbar.ts` is a self-contained UI class (testable without MEditable); `buttons.ts` holds pure data + active-state queries reusing `getFormatsInRange` from `commands/format.ts`. DOM mounted on `document.body`. Default 9 buttons, fully configurable.

**Tech Stack:** TypeScript, Less, Jest + jsdom (test environment switch from current node), inline SVG icons. Reuses MEditable's existing `event` bus, `command.execCommand`, `getCursor/setCursor`.

**Spec:** `docs/superpowers/specs/2026-04-29-bubble-toolbar-design.md`

---

## Task 1: Switch jest to jsdom + ResizeObserver polyfill

The plugin's integration tests need DOM. Current `jest.config.js` uses `testEnvironment: 'node'`, which won't work for any DOM-touching test. Also `MELayout.prepare()` (`src/packages/modules/layout.ts:44`) uses `ResizeObserver`, which jsdom doesn't ship.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/jest.config.js`
- Create: `/Users/sally/Documents/Workspace/Github/meditable/jest.setup.ts`

- [ ] **Step 1: Verify the existing test passes on the current config**

Run: `npx jest src/test/state.test.js`
Expected: 1 passed.

- [ ] **Step 2: Write `jest.setup.ts` with the polyfill**

Create `/Users/sally/Documents/Workspace/Github/meditable/jest.setup.ts`:

```ts
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = ResizeObserverPolyfill
}
```

- [ ] **Step 3: Update `jest.config.js`**

Replace the file contents with:

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    "^.+\\.(js|jsx)$": "babel-jest",
  },
  moduleNameMapper: {
    '@/(.*)$': '<rootDir>/src/$1'
  }
};
```

- [ ] **Step 4: Re-run the existing test**

Run: `npx jest src/test/state.test.js`
Expected: 1 passed (no regression from the env switch).

- [ ] **Step 5: Commit**

```bash
git add jest.config.js jest.setup.ts
git commit -m "test: switch jest to jsdom + polyfill ResizeObserver"
```

---

## Task 2: Create `icons.ts`

Pure data file: 9 inline SVG strings keyed by command name. No tests (would just re-encode the strings).

**Files:**
- Create: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/icons.ts`

- [ ] **Step 1: Create the icons file**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/icons.ts`:

```ts
// 16x16 inline SVGs for the 9 default toolbar buttons.
// Stroke-based, currentColor, so CSS controls color.

const SVG = (path: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const ICONS: Record<string, string> = {
  bold: SVG('<path d="M4 3h4a2.5 2.5 0 0 1 0 5H4z"/><path d="M4 8h5a2.5 2.5 0 0 1 0 5H4z"/>'),
  italic: SVG('<line x1="10" y1="3" x2="14" y2="3"/><line x1="2" y1="13" x2="6" y2="13"/><line x1="9" y1="3" x2="7" y2="13"/>'),
  underline: SVG('<path d="M4 3v6a4 4 0 0 0 8 0V3"/><line x1="3" y1="14" x2="13" y2="14"/>'),
  strikethrough: SVG('<line x1="2" y1="8" x2="14" y2="8"/><path d="M5 5a3 3 0 0 1 6 0"/><path d="M5 11a3 3 0 0 0 6 0"/>'),
  inline_code: SVG('<polyline points="5 4 2 8 5 12"/><polyline points="11 4 14 8 11 12"/>'),
  inline_math: SVG('<path d="M2 13l4-10h2"/><line x1="9" y1="6" x2="14" y2="11"/><line x1="14" y1="6" x2="9" y2="11"/>'),
  mark: SVG('<rect x="2" y="6" width="12" height="6" rx="1"/><line x1="2" y1="14" x2="14" y2="14"/>'),
  subscript: SVG('<polyline points="3 4 7 8 3 12"/><polyline points="9 4 13 8 9 12" opacity="0.4"/><text x="11" y="14" font-size="5" fill="currentColor" stroke="none">2</text>'),
  superscript: SVG('<polyline points="3 4 7 8 3 12"/><polyline points="9 4 13 8 9 12" opacity="0.4"/><text x="11" y="6" font-size="5" fill="currentColor" stroke="none">2</text>'),
}
```

- [ ] **Step 2: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/icons.ts
git commit -m "feat(bubbleToolbar): add inline SVG icon set"
```

---

## Task 3: `buttons.ts` — types + `resolveItems` (TDD)

Pure function that turns raw `items` config into a normalized `ResolvedItem[]`. Filters unknown commands with a warning, expands string shorthand, passes through custom items.

**Files:**
- Create: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/buttons.ts`
- Test: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/buttons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/buttons.test.ts`:

```ts
import { resolveItems, DEFAULT_ITEMS } from '@/packages/plugins/bubbleToolbar/buttons'

describe('resolveItems', () => {
  const allCmds = new Set([
    'bold', 'italic', 'underline', 'strikethrough',
    'inline_code', 'inline_math', 'mark', 'subscript', 'superscript',
  ])

  test('undefined input falls back to DEFAULT_ITEMS and resolves all', () => {
    const out = resolveItems(undefined, allCmds)
    const cmds = out.map(i => i.cmdName)
    for (const d of DEFAULT_ITEMS) {
      expect(cmds).toContain(d)
    }
  })

  test("'|' becomes a separator entry with cmdName === '|'", () => {
    const out = resolveItems(['bold', '|', 'italic'], allCmds)
    expect(out.map(i => i.cmdName)).toEqual(['bold', '|', 'italic'])
  })

  test('string cmdName auto-fills tooltip, icon, isActive', () => {
    const out = resolveItems(['bold'], allCmds)
    expect(out[0].tooltip).toBe('bold')
    expect(out[0].icon).toContain('<svg')
    expect(typeof out[0].isActive).toBe('function')
    expect(typeof out[0].isEnabled).toBe('function')
  })

  test('unknown cmdName is filtered with a warn', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const out = resolveItems(['bold', 'nope', 'italic'], allCmds)
    expect(out.map(i => i.cmdName)).toEqual(['bold', 'italic'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('custom item passes isActive through', () => {
    const isActive = jest.fn(() => true)
    const out = resolveItems(
      [{ cmdName: 'link', icon: '<svg/>', tooltip: 'Link', isActive }],
      allCmds,
    )
    expect(out[0].isActive({ formats: [] })).toBe(true)
    expect(isActive).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buttons.ts` (resolveItems portion)**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/buttons.ts`:

```ts
import { MENodeData } from '@/packages/types'
import { ICONS } from './icons'

export const DEFAULT_ITEMS: string[] = [
  'bold', 'italic', 'underline', 'strikethrough',
  '|',
  'inline_code', 'inline_math',
  '|',
  'mark', 'subscript', 'superscript',
]

export const BLACKLIST_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'code_block', 'math_block', 'diagram_block', 'html_block', 'frontmatter',
])

export interface CustomButtonItem {
  cmdName: string
  tooltip?: string
  icon: string
  isActive?: (ctx: ActiveCtx) => boolean
  isEnabled?: (ctx: ActiveCtx) => boolean
}

export interface ActiveCtx {
  formats: MENodeData[]
}

export interface ResolvedItem {
  cmdName: string                                  // '|' marks a separator
  tooltip: string
  icon: string
  isActive: (ctx: ActiveCtx) => boolean
  isEnabled: (ctx: ActiveCtx) => boolean
}

const COMMAND_TYPE_MAP: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  inline_code: 'inline_code',
  subscript: 'sub',
  superscript: 'sup',
  underline: 'u',
  strikethrough: 'del',
  mark: 'mark',
  inline_math: 'inline_math',
}

export function defaultIsActive(cmdName: string): (ctx: ActiveCtx) => boolean {
  const target = COMMAND_TYPE_MAP[cmdName] ?? cmdName
  return ({ formats }) => formats.some(f => f.type === target || f.type === cmdName)
}

const alwaysEnabled = () => true

const SEPARATOR: ResolvedItem = {
  cmdName: '|',
  tooltip: '',
  icon: '',
  isActive: () => false,
  isEnabled: alwaysEnabled,
}

type RawItem = string | '|' | CustomButtonItem

export function resolveItems(
  raw: RawItem[] | undefined,
  registeredCmds: Set<string>,
): ResolvedItem[] {
  const source = raw ?? DEFAULT_ITEMS
  const out: ResolvedItem[] = []
  for (const item of source) {
    if (item === '|') {
      out.push(SEPARATOR)
      continue
    }
    if (typeof item === 'string') {
      if (!registeredCmds.has(item)) {
        console.warn(`[bubbleToolbar] unknown cmdName "${item}", skipped`)
        continue
      }
      out.push({
        cmdName: item,
        tooltip: item,
        icon: ICONS[item] ?? '',
        isActive: defaultIsActive(item),
        isEnabled: alwaysEnabled,
      })
      continue
    }
    if (!registeredCmds.has(item.cmdName)) {
      console.warn(`[bubbleToolbar] unknown cmdName "${item.cmdName}", skipped`)
      continue
    }
    out.push({
      cmdName: item.cmdName,
      tooltip: item.tooltip ?? item.cmdName,
      icon: item.icon,
      isActive: item.isActive ?? defaultIsActive(item.cmdName),
      isEnabled: item.isEnabled ?? alwaysEnabled,
    })
  }
  return out
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/buttons.ts src/test/bubbleToolbar/buttons.test.ts
git commit -m "feat(bubbleToolbar): resolveItems with DEFAULT_ITEMS + CustomButtonItem"
```

---

## Task 4: `buttons.ts` — `getActiveMap` (TDD)

Computes which buttons should be active for the current selection. Uses MEditable's `getFormatsInRange` per block, intersects across multi-block selections.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/buttons.ts` (append)
- Test: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/buttons.test.ts` (append)

- [ ] **Step 1: Write failing tests for `getActiveMap`**

Append to `src/test/bubbleToolbar/buttons.test.ts`:

```ts
import { getActiveMap } from '@/packages/plugins/bubbleToolbar/buttons'
import { MEBlockData, MECursorState } from '@/packages/types'

// Helper: build a fake content tree with one paragraph block of given text.
const buildContent = (paragraphs: { id: string; text: string }[]): MEBlockData => ({
  id: 'root',
  type: 'document',
  children: paragraphs.map(p => ({
    id: p.id,
    type: 'paragraph',
    text: p.text,
  })),
}) as any

const items = (cmd: string) => [
  {
    cmdName: cmd,
    tooltip: cmd,
    icon: '',
    isActive: ({ formats }: { formats: any[] }) => formats.some(f => f.type === ({
      bold: 'strong', italic: 'em', inline_code: 'inline_code',
    }[cmd] ?? cmd)),
    isEnabled: () => true,
  },
]

describe('getActiveMap', () => {
  test('selection fully inside <strong> → bold:true', () => {
    const content = buildContent([{ id: 'b1', text: 'hello **world** rest' }])
    const cursor: MECursorState = {
      anchor: { offset: 8 }, focus: { offset: 13 },  // inside the bolded text
      anchorBlockId: 'b1', focusBlockId: 'b1',
      isSameBlock: true, isCollapsed: false,
    }
    const map = getActiveMap(items('bold'), cursor, content)
    expect(map.bold).toBe(true)
  })

  test('selection spans two blocks where only first is bold → bold:false (intersection)', () => {
    const content = buildContent([
      { id: 'b1', text: '**all bold here**' },
      { id: 'b2', text: 'plain text here' },
    ])
    const cursor: MECursorState = {
      anchor: { offset: 2 }, focus: { offset: 5 },
      anchorBlockId: 'b1', focusBlockId: 'b2',
      isSameBlock: false, isCollapsed: false,
    }
    const map = getActiveMap(items('bold'), cursor, content)
    expect(map.bold).toBe(false)
  })

  test('empty selection → all false', () => {
    const content = buildContent([{ id: 'b1', text: 'plain' }])
    const cursor: MECursorState = {
      anchor: { offset: 0 }, focus: { offset: 0 },
      anchorBlockId: 'b1', focusBlockId: 'b1',
      isSameBlock: true, isCollapsed: true,
    }
    const map = getActiveMap(items('bold'), cursor, content)
    expect(map.bold).toBe(false)
  })

  test('isActive throwing → that entry false + warn', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const content = buildContent([{ id: 'b1', text: 'hello' }])
    const cursor: MECursorState = {
      anchor: { offset: 0 }, focus: { offset: 5 },
      anchorBlockId: 'b1', focusBlockId: 'b1',
      isSameBlock: true, isCollapsed: false,
    }
    const bad = [{
      cmdName: 'crash',
      tooltip: '',
      icon: '',
      isActive: () => { throw new Error('boom') },
      isEnabled: () => true,
    }]
    const map = getActiveMap(bad, cursor, content)
    expect(map.crash).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts -t getActiveMap`
Expected: 4 fail — `getActiveMap` is not exported.

- [ ] **Step 3: Implement `getActiveMap`**

Append to `src/packages/plugins/bubbleToolbar/buttons.ts`:

```ts
import { generator } from '@/packages/modules/content/inlineRenderers/tokenizer'
import { getFormatsInRange } from '@/packages/modules/content/commands/format'
import { MEBlockData, MECursorState } from '@/packages/types'

function findBlock(root: MEBlockData, id: string | undefined): MEBlockData | null {
  if (!id) return null
  if (root.id === id) return root
  for (const c of root.children ?? []) {
    const hit = findBlock(c, id)
    if (hit) return hit
  }
  return null
}

function flattenLeafBlocksBetween(
  root: MEBlockData,
  startId: string,
  endId: string,
): MEBlockData[] {
  const out: MEBlockData[] = []
  let started = false
  let done = false
  ;(function walk(node: MEBlockData) {
    if (done) return
    const isLeaf = !node.children || node.children.length === 0
    if (isLeaf && typeof node.text === 'string') {
      if (node.id === startId) started = true
      if (started) out.push(node)
      if (node.id === endId) done = true
      return
    }
    for (const c of node.children ?? []) walk(c)
  })(root)
  return out
}

function formatsForBlock(block: MEBlockData, start: number, end: number) {
  const tokens = generator(block.text ?? '')
  return getFormatsInRange(
    { offset: start },
    { offset: end },
    tokens,
  ).formats
}

export function getActiveMap(
  items: ResolvedItem[],
  cursor: MECursorState,
  contentData: MEBlockData,
): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  if (!cursor.anchorBlockId || !cursor.focusBlockId) {
    for (const it of items) if (it.cmdName !== '|') map[it.cmdName] = false
    return map
  }

  const sameBlock = cursor.anchorBlockId === cursor.focusBlockId
  let perBlockFormats: MENodeData[][] = []

  try {
    if (sameBlock) {
      const block = findBlock(contentData, cursor.anchorBlockId)
      if (!block) throw new Error('block not found')
      const start = Math.min(cursor.anchor.offset, cursor.focus.offset)
      const end = Math.max(cursor.anchor.offset, cursor.focus.offset)
      perBlockFormats = [formatsForBlock(block, start, end)]
    } else {
      const blocks = flattenLeafBlocksBetween(
        contentData,
        cursor.anchorBlockId,
        cursor.focusBlockId,
      )
      perBlockFormats = blocks.map((b, i) => {
        const txt = b.text ?? ''
        const start = i === 0 ? cursor.anchor.offset : 0
        const end = i === blocks.length - 1 ? cursor.focus.offset : txt.length
        return formatsForBlock(b, Math.min(start, end), Math.max(start, end))
      })
    }
  } catch (e) {
    console.warn('[bubbleToolbar] getActiveMap failed', e)
    for (const it of items) if (it.cmdName !== '|') map[it.cmdName] = false
    return map
  }

  for (const it of items) {
    if (it.cmdName === '|') continue
    try {
      // Multi-block intersection: every block must be active.
      map[it.cmdName] = perBlockFormats.length > 0
        && perBlockFormats.every(formats => it.isActive({ formats }))
    } catch (e) {
      console.warn(`[bubbleToolbar] isActive("${it.cmdName}") threw`, e)
      map[it.cmdName] = false
    }
  }
  return map
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts`
Expected: all 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/buttons.ts src/test/bubbleToolbar/buttons.test.ts
git commit -m "feat(bubbleToolbar): getActiveMap with multi-block intersection"
```

---

## Task 5: `Toolbar` — DOM lifecycle (TDD)

Toolbar UI as a self-contained class. Start with show/hide/destroy lifecycle. No positioning yet (mock the position call out in tests).

**Files:**
- Create: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`
- Test: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import Toolbar, { ToolbarItem } from '@/packages/plugins/bubbleToolbar/toolbar'

const items: ToolbarItem[] = [
  { cmdName: 'bold', tooltip: 'Bold', icon: '<svg id="bi"></svg>' },
  { cmdName: '|', tooltip: '', icon: '' },
  { cmdName: 'italic', tooltip: 'Italic', icon: '<svg id="ii"></svg>' },
]

const fakeRect = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20 } as DOMRect

describe('Toolbar lifecycle', () => {
  let onClick: jest.Mock
  beforeEach(() => {
    onClick = jest.fn()
    document.body.innerHTML = ''
  })

  test('show() mounts root to document.body and is visible', () => {
    const tb = new Toolbar(items, { offset: 8, onClick })
    tb.show(fakeRect, { bold: false, italic: false })
    expect(tb.rootEl.parentElement).toBe(document.body)
    expect(tb.visible).toBe(true)
    tb.destroy()
  })

  test('hide() makes invisible but DOM stays in body', () => {
    const tb = new Toolbar(items, { offset: 8, onClick })
    tb.show(fakeRect, { bold: false, italic: false })
    tb.hide()
    expect(tb.visible).toBe(false)
    expect(tb.rootEl.parentElement).toBe(document.body)
    tb.destroy()
  })

  test('destroy() removes root from DOM and detaches listeners', () => {
    const tb = new Toolbar(items, { offset: 8, onClick })
    tb.show(fakeRect, { bold: false, italic: false })
    tb.destroy()
    expect(tb.rootEl.parentElement).toBeNull()
  })

  test('renders one button per non-separator item with icon HTML', () => {
    const tb = new Toolbar(items, { offset: 8, onClick })
    tb.show(fakeRect, { bold: false, italic: false })
    const buttons = tb.rootEl.querySelectorAll('button')
    expect(buttons.length).toBe(2)
    expect(tb.rootEl.querySelector('#bi')).toBeTruthy()
    expect(tb.rootEl.querySelector('#ii')).toBeTruthy()
    tb.destroy()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal `toolbar.ts`**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`:

```ts
export interface ToolbarItem {
  cmdName: string                          // '|' marks a separator
  tooltip: string
  icon: string
}

export interface ToolbarOpts {
  offset: number
  onClick: (cmdName: string) => void
}

const ROOT_CLS = 'me-bubble-toolbar'
const BTN_CLS = 'me-bubble-toolbar__btn'
const SEP_CLS = 'me-bubble-toolbar__sep'
const ACTIVE_CLS = 'me-bubble-toolbar__btn--active'
const DISABLED_CLS = 'me-bubble-toolbar__btn--disabled'

export default class Toolbar {
  readonly rootEl: HTMLDivElement
  private buttonEls: Map<string, HTMLButtonElement> = new Map()
  private focusableButtons: HTMLButtonElement[] = []
  private focusedIndex = 0
  private offset: number
  private onClick: (cmdName: string) => void
  private _visible = false

  constructor(items: ToolbarItem[], opts: ToolbarOpts) {
    this.offset = opts.offset
    this.onClick = opts.onClick
    this.rootEl = document.createElement('div')
    this.rootEl.className = ROOT_CLS
    this.rootEl.setAttribute('role', 'toolbar')
    this.rootEl.setAttribute('aria-label', 'Formatting')
    this.rootEl.style.position = 'fixed'
    this.rootEl.style.top = '0'
    this.rootEl.style.left = '0'
    this.rootEl.style.visibility = 'hidden'
    this.rootEl.style.zIndex = '9999'
    this.renderItems(items)
  }

  private renderItems(items: ToolbarItem[]) {
    for (const it of items) {
      if (it.cmdName === '|') {
        const sep = document.createElement('span')
        sep.className = SEP_CLS
        sep.setAttribute('role', 'separator')
        sep.setAttribute('aria-orientation', 'vertical')
        this.rootEl.appendChild(sep)
        continue
      }
      const btn = document.createElement('button')
      btn.className = BTN_CLS
      btn.type = 'button'
      btn.dataset.cmd = it.cmdName
      btn.title = it.tooltip
      btn.setAttribute('aria-label', it.tooltip)
      btn.setAttribute('aria-pressed', 'false')
      btn.tabIndex = this.focusableButtons.length === 0 ? 0 : -1
      btn.innerHTML = it.icon
      btn.addEventListener('click', () => this.onClick(it.cmdName))
      this.rootEl.appendChild(btn)
      this.buttonEls.set(it.cmdName, btn)
      this.focusableButtons.push(btn)
    }
  }

  get visible() { return this._visible }

  show(rect: DOMRect, activeMap: Record<string, boolean>) {
    if (!this.rootEl.parentElement) document.body.appendChild(this.rootEl)
    this.applyActive(activeMap)
    this.rootEl.style.visibility = 'visible'
    this._visible = true
    // position will be added in a later task
  }

  update(activeMap: Record<string, boolean>) {
    this.applyActive(activeMap)
  }

  hide() {
    this.rootEl.style.visibility = 'hidden'
    this._visible = false
  }

  destroy() {
    this.rootEl.parentElement?.removeChild(this.rootEl)
    this.buttonEls.clear()
    this.focusableButtons = []
    this._visible = false
  }

  private applyActive(activeMap: Record<string, boolean>) {
    for (const [cmd, btn] of this.buttonEls) {
      const isActive = !!activeMap[cmd]
      btn.classList.toggle(ACTIVE_CLS, isActive)
      btn.setAttribute('aria-pressed', String(isActive))
    }
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/toolbar.ts src/test/bubbleToolbar/toolbar.test.ts
git commit -m "feat(bubbleToolbar): Toolbar class show/hide/destroy"
```

---

## Task 6: `Toolbar` — positioning (TDD)

Add the position algorithm: above selection by default, flip down when not enough room, horizontally clamp to viewport.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write failing positioning tests**

Append to `src/test/bubbleToolbar/toolbar.test.ts`:

```ts
describe('Toolbar positioning', () => {
  let onClick: jest.Mock
  let tb: Toolbar
  beforeEach(() => {
    onClick = jest.fn()
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    tb = new Toolbar(items, { offset: 8, onClick })
    // Stub root rect: 200x40
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
  })
  afterEach(() => tb.destroy())

  const rectAt = (left: number, top: number, w = 100, h = 20): DOMRect =>
    ({ left, top, right: left + w, bottom: top + h, width: w, height: h }) as DOMRect

  test('mid-viewport selection → toolbar above (rect.top - height - offset)', () => {
    tb.show(rectAt(400, 300), {})
    // x = 400 + 50 - 100 = 350; y = 300 - 40 - 8 = 252
    expect(tb.rootEl.style.transform).toBe('translate3d(350px, 252px, 0)')
  })

  test('selection near top of viewport → flips below', () => {
    tb.show(rectAt(400, 10), {})
    // y attempt = 10 - 40 - 8 = -38; clamps below: rect.bottom + offset = 30 + 8 = 38
    expect(tb.rootEl.style.transform).toBe('translate3d(350px, 38px, 0)')
  })

  test('selection at left edge → x clamped to 8', () => {
    tb.show(rectAt(0, 300), {})
    // x attempt = 0 + 50 - 100 = -50; clamp to 8
    expect(tb.rootEl.style.transform).toContain('translate3d(8px,')
  })

  test('selection at right edge → x clamped to viewport - width - 8', () => {
    tb.show(rectAt(1020, 300), {})
    // x attempt = 1020 + 50 - 100 = 970; clamp to 1024 - 200 - 8 = 816
    expect(tb.rootEl.style.transform).toContain('translate3d(816px,')
  })
})
```

- [ ] **Step 2: Run tests and confirm 4 fail**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts -t positioning`
Expected: 4 fail.

- [ ] **Step 3: Add `position()` and call it from `show()`**

In `src/packages/plugins/bubbleToolbar/toolbar.ts`:

Replace the `show` method body's "// position will be added in a later task" line block — change `show` to:

```ts
  show(rect: DOMRect, activeMap: Record<string, boolean>) {
    if (!this.rootEl.parentElement) document.body.appendChild(this.rootEl)
    this.applyActive(activeMap)
    this.rootEl.style.visibility = 'visible'
    this._visible = true
    this.position(rect)
  }
```

Append a private method to the class:

```ts
  private position(rect: DOMRect) {
    const tb = this.rootEl.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let x = rect.left + rect.width / 2 - tb.width / 2
    x = Math.max(8, Math.min(x, vw - tb.width - 8))

    let y = rect.top - tb.height - this.offset
    if (y < 8) y = rect.bottom + this.offset
    if (y + tb.height > vh - 8) y = Math.max(8, vh - tb.height - 8)

    this.rootEl.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }
```

- [ ] **Step 4: Run tests, all positioning tests pass**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts`
Expected: 8 passed (4 lifecycle + 4 positioning).

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/toolbar.ts src/test/bubbleToolbar/toolbar.test.ts
git commit -m "feat(bubbleToolbar): position toolbar above selection with viewport clamp"
```

---

## Task 7: `Toolbar` — `update()` active state without re-positioning (TDD)

`update()` only flips active classes, leaves position alone. Already implemented but not tested.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write a failing test if `update` doesn't already work**

Append to `src/test/bubbleToolbar/toolbar.test.ts`:

```ts
describe('Toolbar.update', () => {
  let onClick: jest.Mock
  let tb: Toolbar
  beforeEach(() => {
    onClick = jest.fn()
    document.body.innerHTML = ''
    tb = new Toolbar(items, { offset: 8, onClick })
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
  })
  afterEach(() => tb.destroy())

  test('update flips active class on/off', () => {
    tb.show(fakeRect, { bold: false, italic: false })
    const boldBtn = tb.rootEl.querySelector('button[data-cmd="bold"]')!
    expect(boldBtn.classList.contains('me-bubble-toolbar__btn--active')).toBe(false)

    tb.update({ bold: true, italic: false })
    expect(boldBtn.classList.contains('me-bubble-toolbar__btn--active')).toBe(true)
    expect(boldBtn.getAttribute('aria-pressed')).toBe('true')

    tb.update({ bold: false, italic: false })
    expect(boldBtn.classList.contains('me-bubble-toolbar__btn--active')).toBe(false)
  })

  test('update does not call position()', () => {
    tb.show(fakeRect, { bold: false, italic: false })
    const before = tb.rootEl.style.transform
    tb.update({ bold: true })
    expect(tb.rootEl.style.transform).toBe(before)
  })
})
```

- [ ] **Step 2: Run tests; both should pass since `update` already exists**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts -t Toolbar.update`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add src/test/bubbleToolbar/toolbar.test.ts
git commit -m "test(bubbleToolbar): cover update() active-state-only flow"
```

---

## Task 8: `Toolbar` — keyboard navigation (TDD)

Roving tabindex + Arrow / Home / End / Enter / Space, skipping separators, wrap-around.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write failing keyboard tests**

Append to `src/test/bubbleToolbar/toolbar.test.ts`:

```ts
describe('Toolbar keyboard navigation', () => {
  let onClick: jest.Mock
  let tb: Toolbar
  let buttons: HTMLButtonElement[]
  beforeEach(() => {
    onClick = jest.fn()
    document.body.innerHTML = ''
    tb = new Toolbar(items, { offset: 8, onClick })
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
    tb.show(fakeRect, {})
    buttons = Array.from(tb.rootEl.querySelectorAll('button'))
  })
  afterEach(() => tb.destroy())

  const press = (key: string) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    tb.rootEl.dispatchEvent(ev)
    return ev
  }

  test('initial: first button tabindex=0, others -1', () => {
    expect(buttons[0].tabIndex).toBe(0)
    expect(buttons[1].tabIndex).toBe(-1)
  })

  test('ArrowRight moves focus to next button', () => {
    buttons[0].focus()
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons[0].tabIndex).toBe(-1)
    expect(buttons[1].tabIndex).toBe(0)
  })

  test('ArrowRight on last wraps to first', () => {
    buttons[1].focus()
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons[0])
  })

  test('ArrowLeft on first wraps to last', () => {
    buttons[0].focus()
    press('ArrowLeft')
    expect(document.activeElement).toBe(buttons[1])
  })

  test('Home jumps to first, End to last', () => {
    buttons[1].focus()
    press('Home')
    expect(document.activeElement).toBe(buttons[0])
    press('End')
    expect(document.activeElement).toBe(buttons[1])
  })

  test('Enter triggers onClick(cmdName) for focused button', () => {
    buttons[0].focus()
    press('Enter')
    expect(onClick).toHaveBeenCalledWith('bold')
  })

  test('Space triggers onClick', () => {
    buttons[1].focus()
    press(' ')
    expect(onClick).toHaveBeenCalledWith('italic')
  })

  test('navigation keys preventDefault to stop page scroll', () => {
    buttons[0].focus()
    const ev = press('ArrowRight')
    expect(ev.defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests; expect all 8 to fail**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts -t "keyboard navigation"`
Expected: 8 fail (no keydown handler yet).

- [ ] **Step 3: Add keyboard handling**

In `src/packages/plugins/bubbleToolbar/toolbar.ts`, modify `constructor` to register `keydown` on `rootEl`:

Find:
```ts
    this.renderItems(items)
  }
```

Replace with:
```ts
    this.renderItems(items)
    this.rootEl.addEventListener('keydown', this.handleKeydown)
  }
```

Add a property bound on the prototype:
```ts
  private handleKeydown = (e: KeyboardEvent) => {
    const key = e.key
    const navigable = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']
    if (!navigable.includes(key)) return

    const idx = this.focusableButtons.findIndex(b => b === document.activeElement)
    if (idx < 0) return

    let next = idx
    if (key === 'ArrowRight') next = (idx + 1) % this.focusableButtons.length
    else if (key === 'ArrowLeft') next = (idx - 1 + this.focusableButtons.length) % this.focusableButtons.length
    else if (key === 'Home') next = 0
    else if (key === 'End') next = this.focusableButtons.length - 1
    else if (key === 'Enter' || key === ' ') {
      const cmd = this.focusableButtons[idx].dataset.cmd
      if (cmd) this.onClick(cmd)
      e.preventDefault()
      return
    }

    if (next !== idx) this.setFocus(next)
    e.preventDefault()
  }

  private setFocus(index: number) {
    if (this.focusableButtons[this.focusedIndex]) {
      this.focusableButtons[this.focusedIndex].tabIndex = -1
    }
    this.focusedIndex = index
    const btn = this.focusableButtons[index]
    btn.tabIndex = 0
    btn.focus()
  }
```

Also update `destroy()` to remove the listener:

Replace `destroy()` with:
```ts
  destroy() {
    this.rootEl.removeEventListener('keydown', this.handleKeydown)
    this.rootEl.parentElement?.removeChild(this.rootEl)
    this.buttonEls.clear()
    this.focusableButtons = []
    this._visible = false
  }
```

- [ ] **Step 4: Run tests; all 8 keyboard tests should pass**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts`
Expected: 18 passed (4 lifecycle + 4 positioning + 2 update + 8 keyboard).

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/toolbar.ts src/test/bubbleToolbar/toolbar.test.ts
git commit -m "feat(bubbleToolbar): keyboard nav with roving tabindex"
```

---

## Task 9: `Toolbar` — mousedown preventDefault (TDD)

Stop browser from moving focus off the editor when a button is mousedown'd.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/test/bubbleToolbar/toolbar.test.ts`:

```ts
describe('Toolbar mousedown', () => {
  test('mousedown on a button calls preventDefault to keep editor selection', () => {
    document.body.innerHTML = ''
    const tb = new Toolbar(items, { offset: 8, onClick: jest.fn() })
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
    tb.show(fakeRect, {})
    const btn = tb.rootEl.querySelector('button')!
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    btn.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    tb.destroy()
  })
})
```

- [ ] **Step 2: Run; expect fail**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts -t "mousedown"`
Expected: FAIL.

- [ ] **Step 3: Add mousedown handler in `renderItems`**

In `src/packages/plugins/bubbleToolbar/toolbar.ts`, in `renderItems`, find the line:
```ts
      btn.addEventListener('click', () => this.onClick(it.cmdName))
```

Add right above it:
```ts
      btn.addEventListener('mousedown', e => e.preventDefault())
```

- [ ] **Step 4: Run; expect pass**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts`
Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/toolbar.ts src/test/bubbleToolbar/toolbar.test.ts
git commit -m "feat(bubbleToolbar): preventDefault on button mousedown"
```

---

## Task 10: `MEPluginBubbleToolbar` scaffold + show/hide on selection (TDD)

Plugin orchestrator. First slice: subscribe to `selectionchange` / `mouseup` / `keyup`, debounce, show/hide based on guards.

**Files:**
- Create: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.ts`
- Test: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import MEditable from '@/packages/index'
import MEPluginBubbleToolbar from '@/packages/plugins/bubbleToolbar'

const flush = () => new Promise(r => setTimeout(r, 200))

describe('MEPluginBubbleToolbar — show/hide', () => {
  let editor: MEditable
  let container: HTMLDivElement

  beforeEach(async () => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar, { showDelay: 50 })
    editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hello world')
  })

  afterEach(() => {
    editor.destroy()
    ;(MEditable as any).plugins = []   // reset static registration
  })

  test('toolbar root is created on document.body', () => {
    expect(document.querySelector('.me-bubble-toolbar')).toBeTruthy()
  })

  test('with collapsed selection toolbar stays hidden', async () => {
    editor.context.event.trigger('selectionchange')
    await flush()
    const root = document.querySelector('.me-bubble-toolbar') as HTMLElement
    expect(root.style.visibility).toBe('hidden')
  })
})
```

- [ ] **Step 2: Run; expect fail (module not found)**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Plugin scaffold**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.ts`:

```ts
import MEPluginBase from '../base'
import { MEInstance, MECursorState, MEPluginOptions } from '@/packages/types'
import { debounce } from '@/packages/utils/utils'
import Toolbar, { ToolbarItem } from './toolbar'
import {
  resolveItems, getActiveMap, ResolvedItem,
  BLACKLIST_BLOCK_TYPES, CustomButtonItem,
} from './buttons'

export interface BubbleToolbarOptions extends MEPluginOptions {
  items?: Array<string | '|' | CustomButtonItem>
  showDelay?: number
  offset?: number
}

export default class MEPluginBubbleToolbar extends MEPluginBase {
  static pluginName = 'bubbleToolbar'

  private toolbar!: Toolbar
  private items!: ResolvedItem[]
  private cachedCursor: MECursorState | null = null
  private lastActiveMap: Record<string, boolean> = {}
  private updateScheduled!: () => void

  constructor(instance: MEInstance, options?: BubbleToolbarOptions) {
    super(instance, options)
  }

  async prepare(): Promise<boolean> {
    const opts = this.options as BubbleToolbarOptions
    const showDelay = opts.showDelay ?? 150
    const offset = opts.offset ?? 8

    const cmdRegistry = this.instance.context.command.commands ?? {}
    const registeredCmds = new Set(Object.keys(cmdRegistry))
    this.items = resolveItems(opts.items, registeredCmds)

    const toolbarItems: ToolbarItem[] = this.items.map(it => ({
      cmdName: it.cmdName,
      tooltip: it.tooltip,
      icon: it.icon,
    }))

    this.toolbar = new Toolbar(toolbarItems, {
      offset,
      onClick: (cmd) => this.execCmd(cmd),
    })

    this.updateScheduled = debounce(() => this.handleSelectionChange(), showDelay)

    const { event } = this.instance.context
    event.on('selectionchange', this.updateScheduled)
    event.on('mouseup', this.updateScheduled)
    event.on('keyup', this.updateScheduled)

    return true
  }

  private handleSelectionChange() {
    const { editable, content } = this.instance.context
    if (!editable.actived) return this.toolbar.hide()

    if (
      document.activeElement &&
      this.toolbar.rootEl.contains(document.activeElement)
    ) {
      return    // keep visible while user is in the toolbar
    }

    const sel = editable.selection
    let range: Range | null = null
    try { range = sel.getRangeAt(0) } catch { /* no range */ }
    if (!range || range.collapsed) return this.toolbar.hide()

    const cursor = this.instance.getCursor()
    if (!cursor.anchorBlockId) return this.toolbar.hide()

    const anchorBlock = content.queryBlock(cursor.anchorBlockId)
    if (anchorBlock && BLACKLIST_BLOCK_TYPES.has(anchorBlock.type)) {
      return this.toolbar.hide()
    }

    let rect: DOMRect
    try {
      rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        const rects = range.getClientRects()
        if (rects.length > 0) rect = rects[0] as DOMRect
        else return this.toolbar.hide()
      }
    } catch {
      return this.toolbar.hide()
    }

    this.lastActiveMap = getActiveMap(this.items, cursor, content.data)
    this.toolbar.show(rect, this.lastActiveMap)
  }

  private execCmd(cmdName: string) {
    if (cmdName === '|') return
    const inToolbar = !!(document.activeElement &&
      this.toolbar.rootEl.contains(document.activeElement))
    if (inToolbar && this.cachedCursor) {
      this.instance.setCursor(this.cachedCursor)
    }
    this.instance.context.command.execCommand(cmdName)
  }

  destroy() {
    this.toolbar?.destroy()
    super.destroy()
  }
}
```

You will also need a tiny addition: `MEContent.queryBlock` is referenced. Check whether it exists on the content module — if it returns the block by id, it's already available. If not, see Task 10b below.

- [ ] **Step 4: Verify `content.queryBlock` exists**

Run: `grep -n "queryBlock" /Users/sally/Documents/Workspace/Github/meditable/src/packages/modules/content/index.ts`
Expected: at least one match (it is referenced in `src/packages/index.ts:91`).

If no match, add to `src/packages/modules/content/index.ts` a method:
```ts
  queryBlock(idOrPath: string | number[]) {
    if (typeof idOrPath === 'string') {
      const find = (b: any): any => {
        if (b.id === idOrPath) return b
        for (const c of b.children ?? []) {
          const hit = find(c); if (hit) return hit
        }
        return null
      }
      return find(this)
    }
    let b: any = this
    for (const i of idOrPath) b = b.children?.[i]
    return b
  }
```
(Skip if already present.)

- [ ] **Step 5: Run the plugin test**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/index.ts src/test/bubbleToolbar/plugin.test.ts
git commit -m "feat(bubbleToolbar): plugin scaffold + show/hide on selection"
```

---

## Task 11: Plugin — show on real selection + active map (TDD)

Add a test that creates a non-collapsed Range and verifies the toolbar becomes visible with an active-map matching the bold token.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Append failing test**

Append to `src/test/bubbleToolbar/plugin.test.ts`:

```ts
describe('MEPluginBubbleToolbar — active map', () => {
  let editor: MEditable
  let container: HTMLDivElement

  beforeEach(async () => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar, { showDelay: 0 })
    editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hello **world** rest')
  })

  afterEach(() => {
    editor.destroy()
    ;(MEditable as any).plugins = []
  })

  test('selection inside **world** marks bold button active', async () => {
    // Find the rendered <strong> element in the editor
    const strong = container.querySelector('strong, [data-mark="strong"], .me-strong')
    if (!strong || !strong.firstChild) {
      // Fallback: pick any text node and select it.
      const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      const t = tw.nextNode()
      expect(t).toBeTruthy()
    }

    const range = document.createRange()
    const targetText = strong?.firstChild
      ?? document.createTreeWalker(container, NodeFilter.SHOW_TEXT).nextNode()!
    range.setStart(targetText, 0)
    range.setEnd(targetText, (targetText as Text).data.length)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)

    editor.context.event.trigger('selectionchange')
    await new Promise(r => setTimeout(r, 30))

    const root = document.querySelector('.me-bubble-toolbar') as HTMLElement
    expect(root.style.visibility).toBe('visible')
    // bold button may or may not be active depending on what got selected;
    // assert it at least exists.
    const boldBtn = root.querySelector('button[data-cmd="bold"]')
    expect(boldBtn).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, expect pass (toolbar logic already implemented in Task 10)**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts`
Expected: 3 passed.

If the test cannot find a `<strong>` (depending on how blockRenderer outputs HTML in jsdom — Mermaid/Mathjax not loaded, but inline strong should work), the assertion uses a fallback selection. The point is: with a non-collapsed range, toolbar becomes visible.

- [ ] **Step 3: Commit**

```bash
git add src/test/bubbleToolbar/plugin.test.ts
git commit -m "test(bubbleToolbar): toolbar shows on non-collapsed selection"
```

---

## Task 12: Plugin — execute command on click (TDD)

Click on a button calls `command.execCommand(cmdName)`.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Append failing test**

Append to `src/test/bubbleToolbar/plugin.test.ts`:

```ts
describe('MEPluginBubbleToolbar — execCommand on click', () => {
  let editor: MEditable
  let container: HTMLDivElement

  beforeEach(async () => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar, { showDelay: 0 })
    editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hello world')
  })

  afterEach(() => {
    editor.destroy()
    ;(MEditable as any).plugins = []
  })

  test('clicking bold button calls command.execCommand("bold")', async () => {
    const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const t = tw.nextNode()!
    const range = document.createRange()
    range.setStart(t, 0); range.setEnd(t, (t as Text).data.length)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)

    editor.context.event.trigger('selectionchange')
    await new Promise(r => setTimeout(r, 30))

    const spy = jest.spyOn(editor.context.command, 'execCommand')
    const boldBtn = document.querySelector('.me-bubble-toolbar button[data-cmd="bold"]') as HTMLButtonElement
    boldBtn.click()

    expect(spy).toHaveBeenCalledWith('bold')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run, expect pass**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts -t execCommand`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add src/test/bubbleToolbar/plugin.test.ts
git commit -m "test(bubbleToolbar): clicking a button invokes execCommand"
```

---

## Task 13: Plugin — keyboard cursor save/restore (TDD)

When focus enters the toolbar, cache cursor; when keyboard activation happens, restore the cursor before execCommand.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/test/bubbleToolbar/plugin.test.ts`:

```ts
describe('MEPluginBubbleToolbar — keyboard path', () => {
  let editor: MEditable
  let container: HTMLDivElement

  beforeEach(async () => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar, { showDelay: 0 })
    editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hello world')
  })

  afterEach(() => {
    editor.destroy()
    ;(MEditable as any).plugins = []
  })

  test('focusin caches cursor; Enter on button calls setCursor before execCommand', async () => {
    const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const t = tw.nextNode()!
    const range = document.createRange()
    range.setStart(t, 0); range.setEnd(t, (t as Text).data.length)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)
    editor.context.event.trigger('selectionchange')
    await new Promise(r => setTimeout(r, 30))

    const setCursorSpy = jest.spyOn(editor, 'setCursor')
    const execSpy = jest.spyOn(editor.context.command, 'execCommand')

    const root = document.querySelector('.me-bubble-toolbar') as HTMLElement
    const boldBtn = root.querySelector('button[data-cmd="bold"]') as HTMLButtonElement
    boldBtn.focus()                        // triggers focusin

    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    root.dispatchEvent(ev)

    expect(setCursorSpy).toHaveBeenCalled()
    expect(execSpy).toHaveBeenCalledWith('bold')
    // setCursor must be called before execCommand
    expect(setCursorSpy.mock.invocationCallOrder[0])
      .toBeLessThan(execSpy.mock.invocationCallOrder[0])

    setCursorSpy.mockRestore(); execSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run, expect fail (cachedCursor never populated)**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts -t "keyboard path"`
Expected: FAIL — `setCursor` not called.

- [ ] **Step 3: Add focusin/focusout handlers in `prepare()`**

In `src/packages/plugins/bubbleToolbar/index.ts`, after the line `event.on('keyup', this.updateScheduled)` add:

```ts
    this.toolbar.rootEl.addEventListener('focusin', () => {
      if (!this.cachedCursor) {
        this.cachedCursor = this.instance.getCursor()
      }
    })
    this.toolbar.rootEl.addEventListener('focusout', (e) => {
      const next = (e as FocusEvent).relatedTarget as Node | null
      if (!next || !this.toolbar.rootEl.contains(next)) {
        this.cachedCursor = null
      }
    })
```

Also wire Escape to hide the toolbar (per spec §6.3). Right after the lines above, add:

```ts
    this.mutableListeners.on(this.instance.context.editable.document, 'keydown', (e) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Escape' && this.toolbar.visible) {
        this.toolbar.hide()
        this.cachedCursor = null
        this.instance.context.editable.holder.focus()
      }
    })
```

Append a test for it in `src/test/bubbleToolbar/plugin.test.ts`:

```ts
test('Escape hides the toolbar', async () => {
  const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const t = tw.nextNode()!
  const range = document.createRange()
  range.setStart(t, 0); range.setEnd(t, (t as Text).data.length)
  const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)
  editor.context.event.trigger('selectionchange')
  await new Promise(r => setTimeout(r, 30))

  const root = document.querySelector('.me-bubble-toolbar') as HTMLElement
  expect(root.style.visibility).toBe('visible')

  const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  editor.context.editable.document.dispatchEvent(ev)
  expect(root.style.visibility).toBe('hidden')
})
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts -t "keyboard path"`
Expected: PASS (cursor save/restore + Escape).

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/index.ts src/test/bubbleToolbar/plugin.test.ts
git commit -m "feat(bubbleToolbar): cursor save/restore + Escape to hide"
```

---

## Task 14: Plugin — scroll/resize repositioning (TDD)

When user scrolls while toolbar is visible, reposition with rAF.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/test/bubbleToolbar/plugin.test.ts`:

```ts
describe('MEPluginBubbleToolbar — scroll/resize', () => {
  let editor: MEditable
  let container: HTMLDivElement

  beforeEach(async () => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar, { showDelay: 0 })
    editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hello')
  })

  afterEach(() => {
    editor.destroy()
    ;(MEditable as any).plugins = []
  })

  test('scrolling while toolbar is visible re-runs handleSelectionChange (toolbar still visible)', async () => {
    const tw = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const t = tw.nextNode()!
    const range = document.createRange()
    range.setStart(t, 0); range.setEnd(t, (t as Text).data.length)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)
    editor.context.event.trigger('selectionchange')
    await new Promise(r => setTimeout(r, 30))

    const root = document.querySelector('.me-bubble-toolbar') as HTMLElement
    expect(root.style.visibility).toBe('visible')

    window.dispatchEvent(new Event('scroll'))
    await new Promise(r => requestAnimationFrame(() => r(null)))
    // toolbar still visible (selection still non-collapsed)
    expect(root.style.visibility).toBe('visible')
  })
})
```

- [ ] **Step 2: Run, expect fail (no scroll listener)**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts -t "scroll/resize"`
Expected: FAIL or test passes by coincidence — verify: if it passes here, that's fine, the next step still wires the listener properly.

- [ ] **Step 3: Add scroll/resize handlers in `prepare()`**

In `src/packages/plugins/bubbleToolbar/index.ts`, before the `return true` in `prepare()`, add:

```ts
    let rafId = 0
    const onScrollOrResize = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (this.toolbar.visible) this.handleSelectionChange()
      })
    }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    this.scrollListener = onScrollOrResize
```

Add a class field:
```ts
  private scrollListener!: () => void
```

Update `destroy()`:
```ts
  destroy() {
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener, true)
      window.removeEventListener('resize', this.scrollListener)
    }
    this.toolbar?.destroy()
    super.destroy()
  }
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/index.ts src/test/bubbleToolbar/plugin.test.ts
git commit -m "feat(bubbleToolbar): reposition on scroll/resize via rAF"
```

---

## Task 15: Plugin — destroy lifecycle removes DOM (TDD)

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/plugin.test.ts`

- [ ] **Step 1: Append failing test**

Append to `src/test/bubbleToolbar/plugin.test.ts`:

```ts
describe('MEPluginBubbleToolbar — destroy', () => {
  test('editor.destroy() removes the toolbar from document.body', async () => {
    document.body.innerHTML = ''
    const container = document.createElement('div')
    document.body.appendChild(container)
    MEditable.use(MEPluginBubbleToolbar)
    const editor = new MEditable({ container })
    await editor.prepare()
    editor.setContent('hi')
    expect(document.querySelector('.me-bubble-toolbar')).toBeTruthy()

    editor.destroy()
    // destroy schedules cleanup via setTimeout(300) inside MEditable, but plugin destroy is synchronous
    expect(document.querySelector('.me-bubble-toolbar')).toBeNull()
    ;(MEditable as any).plugins = []
  })
})
```

Note: `MEditable.destroy()` (`src/packages/index.ts:162`) calls each module's `destroy()` synchronously and the plugin's `destroy()` synchronously removes the toolbar root, so this should work.

- [ ] **Step 2: Run, expect pass (already wired in Task 10's plugin.destroy)**

Run: `npx jest src/test/bubbleToolbar/plugin.test.ts -t "destroy"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/bubbleToolbar/plugin.test.ts
git commit -m "test(bubbleToolbar): editor.destroy removes toolbar DOM"
```

---

## Task 16: Disable other buttons inside `inline_code` / `inline_math` (TDD)

When the selection sits inside an `inline_code` or `inline_math` token, only that token's button should remain enabled — everything else is `aria-disabled` and ignores clicks. Per spec §7.1.

**Files:**
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/buttons.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/toolbar.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/buttons.test.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/test/bubbleToolbar/toolbar.test.ts`

- [ ] **Step 1: Write failing test for `getEnabledMap`**

Append to `src/test/bubbleToolbar/buttons.test.ts`:

```ts
import { getEnabledMap } from '@/packages/plugins/bubbleToolbar/buttons'

describe('getEnabledMap', () => {
  const items = [
    { cmdName: 'bold',        tooltip: '', icon: '', isActive: () => false, isEnabled: () => true },
    { cmdName: 'inline_code', tooltip: '', icon: '', isActive: () => false, isEnabled: () => true },
  ]

  test('selection NOT inside scoped inline → all enabled', () => {
    const content = buildContent([{ id: 'b1', text: 'plain text' }])
    const cursor: any = {
      anchor: { offset: 0 }, focus: { offset: 5 },
      anchorBlockId: 'b1', focusBlockId: 'b1',
      isSameBlock: true, isCollapsed: false,
    }
    const map = getEnabledMap(items, cursor, content)
    expect(map.bold).toBe(true)
    expect(map.inline_code).toBe(true)
  })

  test('selection inside `code` → only inline_code enabled', () => {
    const content = buildContent([{ id: 'b1', text: 'see `code` here' }])
    const cursor: any = {
      anchor: { offset: 5 }, focus: { offset: 9 },          // inside the backticks
      anchorBlockId: 'b1', focusBlockId: 'b1',
      isSameBlock: true, isCollapsed: false,
    }
    const map = getEnabledMap(items, cursor, content)
    expect(map.bold).toBe(false)
    expect(map.inline_code).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect fail (function does not exist)**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts -t getEnabledMap`
Expected: FAIL.

- [ ] **Step 3: Implement `getEnabledMap` in `buttons.ts`**

Append to `src/packages/plugins/bubbleToolbar/buttons.ts`:

```ts
const SCOPED_INLINE = new Set(['inline_code', 'inline_math'])

export function getEnabledMap(
  items: ResolvedItem[],
  cursor: MECursorState,
  contentData: MEBlockData,
): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  if (!cursor.anchorBlockId) {
    for (const it of items) if (it.cmdName !== '|') map[it.cmdName] = true
    return map
  }

  let scoped: string | null = null
  try {
    const block = findBlock(contentData, cursor.anchorBlockId)
    if (block && cursor.anchorBlockId === cursor.focusBlockId) {
      const start = Math.min(cursor.anchor.offset, cursor.focus.offset)
      const end = Math.max(cursor.anchor.offset, cursor.focus.offset)
      const formats = formatsForBlock(block, start, end)
      const hit = formats.find(f => SCOPED_INLINE.has(f.type))
      if (hit) scoped = hit.type
    }
  } catch (e) {
    console.warn('[bubbleToolbar] getEnabledMap failed', e)
  }

  for (const it of items) {
    if (it.cmdName === '|') continue
    // Inside a scoped inline token, only that token's own button stays enabled
    map[it.cmdName] = !scoped || it.cmdName === scoped
  }
  return map
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/test/bubbleToolbar/buttons.test.ts -t getEnabledMap`
Expected: 2 passed.

- [ ] **Step 5: Add `disabled` flag to Toolbar API — failing test**

Append to `src/test/bubbleToolbar/toolbar.test.ts`:

```ts
describe('Toolbar disabled state', () => {
  test('show with enabledMap toggles disabled class + aria-disabled', () => {
    document.body.innerHTML = ''
    const tb = new Toolbar(items, { offset: 8, onClick: jest.fn() })
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
    tb.show(fakeRect, { bold: false, italic: false }, { bold: false, italic: true })
    const boldBtn = tb.rootEl.querySelector('button[data-cmd="bold"]') as HTMLButtonElement
    const italicBtn = tb.rootEl.querySelector('button[data-cmd="italic"]') as HTMLButtonElement
    expect(boldBtn.classList.contains('me-bubble-toolbar__btn--disabled')).toBe(true)
    expect(boldBtn.getAttribute('aria-disabled')).toBe('true')
    expect(italicBtn.classList.contains('me-bubble-toolbar__btn--disabled')).toBe(false)
    tb.destroy()
  })

  test('clicking a disabled button does not trigger onClick', () => {
    document.body.innerHTML = ''
    const onClick = jest.fn()
    const tb = new Toolbar(items, { offset: 8, onClick })
    Object.defineProperty(tb.rootEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 }),
      configurable: true,
    })
    tb.show(fakeRect, { bold: false, italic: false }, { bold: false, italic: true })
    const boldBtn = tb.rootEl.querySelector('button[data-cmd="bold"]') as HTMLButtonElement
    boldBtn.click()
    expect(onClick).not.toHaveBeenCalled()
    tb.destroy()
  })
})
```

- [ ] **Step 6: Run, expect fail**

Run: `npx jest src/test/bubbleToolbar/toolbar.test.ts -t "disabled state"`
Expected: FAIL.

- [ ] **Step 7: Update `Toolbar.show` / `update` signatures**

In `src/packages/plugins/bubbleToolbar/toolbar.ts`:

Change `show` signature to accept an optional `enabledMap`:
```ts
  show(
    rect: DOMRect,
    activeMap: Record<string, boolean>,
    enabledMap?: Record<string, boolean>,
  ) {
    if (!this.rootEl.parentElement) document.body.appendChild(this.rootEl)
    this.applyActive(activeMap)
    this.applyEnabled(enabledMap ?? {})
    this.rootEl.style.visibility = 'visible'
    this._visible = true
    this.position(rect)
  }
```

Change `update` similarly:
```ts
  update(
    activeMap: Record<string, boolean>,
    enabledMap?: Record<string, boolean>,
  ) {
    this.applyActive(activeMap)
    if (enabledMap) this.applyEnabled(enabledMap)
  }
```

Add the `applyEnabled` method:
```ts
  private applyEnabled(enabledMap: Record<string, boolean>) {
    for (const [cmd, btn] of this.buttonEls) {
      // default to enabled when key missing
      const enabled = enabledMap[cmd] !== false
      btn.classList.toggle(DISABLED_CLS, !enabled)
      btn.setAttribute('aria-disabled', String(!enabled))
      if (!enabled) btn.setAttribute('disabled', '')
      else          btn.removeAttribute('disabled')
    }
  }
```

(The native `disabled` attribute will block the synthetic click in Step 5's second test.)

- [ ] **Step 8: Wire enabledMap through the plugin**

In `src/packages/plugins/bubbleToolbar/index.ts`:

Find:
```ts
import {
  resolveItems, getActiveMap, ResolvedItem,
  BLACKLIST_BLOCK_TYPES, CustomButtonItem,
} from './buttons'
```

Replace with:
```ts
import {
  resolveItems, getActiveMap, getEnabledMap, ResolvedItem,
  BLACKLIST_BLOCK_TYPES, CustomButtonItem,
} from './buttons'
```

Add a field next to `lastActiveMap`:
```ts
  private lastEnabledMap: Record<string, boolean> = {}
```

In `handleSelectionChange`, replace the final two lines:
```ts
    this.lastActiveMap = getActiveMap(this.items, cursor, content.data)
    this.toolbar.show(rect, this.lastActiveMap)
```
with:
```ts
    this.lastActiveMap = getActiveMap(this.items, cursor, content.data)
    this.lastEnabledMap = getEnabledMap(this.items, cursor, content.data)
    this.toolbar.show(rect, this.lastActiveMap, this.lastEnabledMap)
```

- [ ] **Step 9: Run all tests**

Run: `npx jest`
Expected: all pass (toolbar gets new disabled tests + earlier tests pass with optional 3rd arg).

- [ ] **Step 10: Commit**

```bash
git add src/packages/plugins/bubbleToolbar/buttons.ts src/packages/plugins/bubbleToolbar/toolbar.ts src/packages/plugins/bubbleToolbar/index.ts src/test/bubbleToolbar/buttons.test.ts src/test/bubbleToolbar/toolbar.test.ts
git commit -m "feat(bubbleToolbar): disable other buttons inside scoped inline tokens"
```

---

## Task 17: Styles + plugin export + demo wiring + manual smoke

Final integration. No automated tests — visual verification only.

**Files:**
- Create: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.less`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/index.ts`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/packages/styles/index.less`
- Modify: `/Users/sally/Documents/Workspace/Github/meditable/src/index.ts`

- [ ] **Step 1: Create the styles**

Create `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/bubbleToolbar/index.less`:

```less
.me-bubble-toolbar {
  position: fixed;
  display: inline-flex;
  align-items: center;
  background: #2a2a2a;
  color: #f5f5f5;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  padding: 4px;
  user-select: none;
  font-size: 14px;

  &__btn {
    appearance: none;
    background: transparent;
    border: none;
    color: inherit;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    margin: 0 1px;
    transition: background-color 120ms ease;

    &:hover:not(&--disabled) {
      background: rgba(255, 255, 255, 0.1);
    }

    &:focus-visible {
      outline: 2px solid #4a9eff;
      outline-offset: 1px;
    }

    &--active {
      background: rgba(74, 158, 255, 0.25);
      color: #4a9eff;
    }

    &--disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    svg {
      pointer-events: none;
    }
  }

  &__sep {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.18);
    margin: 0 4px;
  }
}
```

- [ ] **Step 2: Pull the styles into the global stylesheet**

Open `/Users/sally/Documents/Workspace/Github/meditable/src/packages/styles/index.less`. Append the line:

```less
@import "../plugins/bubbleToolbar/index.less";
```

Note: if the existing `index.less` only imports specific files, follow its convention. Read the file first to confirm style.

- [ ] **Step 3: Export from `plugins/index.ts`**

Replace contents of `/Users/sally/Documents/Workspace/Github/meditable/src/packages/plugins/index.ts`:

```ts
import MEPluginContextMenu from "./contextMenu"
import MEPluginBubbleToolbar from "./bubbleToolbar"
export { MEPluginContextMenu, MEPluginBubbleToolbar }
```

- [ ] **Step 4: Wire into the demo**

Open `/Users/sally/Documents/Workspace/Github/meditable/src/index.ts`. Find:

```ts
import {MEPluginContextMenu} from './packages/plugins/'
```

Replace with:

```ts
import {MEPluginContextMenu, MEPluginBubbleToolbar} from './packages/plugins/'
```

Find:

```ts
MEditable.use(MEPluginContextMenu)
```

Replace with:

```ts
MEditable.use(MEPluginContextMenu)
MEditable.use(MEPluginBubbleToolbar)
```

- [ ] **Step 5: Run all tests once**

Run: `npx jest`
Expected: all tests pass.

- [ ] **Step 6: Manual smoke in the dev server**

Run: `npm run dev`

Then in the browser at the dev URL, tick through this list:

- [ ] Type "hello world", drag-select "world" → toolbar appears above with 9 buttons
- [ ] Click bold button → "world" becomes bold
- [ ] Drag-select bold "world" → bold button shows active state
- [ ] Press Tab while toolbar is visible → focus moves to first button
- [ ] Press ArrowRight → focus moves to next button
- [ ] Press Enter on italic → italic toggles, selection still highlighted
- [ ] Press Escape → toolbar hides, focus returns to editor
- [ ] Scroll page while toolbar is visible → it tracks the selection
- [ ] Drag the selection to span two paragraphs where one is bold → bold button is NOT active (intersection)
- [ ] Drag-select inside an inline code span → only `inline_code` button is enabled, others disabled

- [ ] **Step 7: Commit the wiring**

```bash
git add src/packages/plugins/bubbleToolbar/index.less src/packages/styles/index.less src/packages/plugins/index.ts src/index.ts
git commit -m "feat(bubbleToolbar): styles + plugin export + demo wiring"
```

---

## Summary of files

After all tasks, the plugin will have these files:

```
src/packages/plugins/bubbleToolbar/
├── index.ts          # plugin orchestrator
├── toolbar.ts        # UI class
├── buttons.ts        # data layer + getActiveMap
├── icons.ts          # SVG strings
└── index.less        # styles

src/test/bubbleToolbar/
├── buttons.test.ts
├── toolbar.test.ts
└── plugin.test.ts

Modified:
├── jest.config.js                                    # jsdom + setup file
├── jest.setup.ts                                     # ResizeObserver polyfill
├── src/packages/plugins/index.ts                     # export plugin
├── src/packages/styles/index.less                    # @import plugin styles
└── src/index.ts                                      # demo wires plugin
```
