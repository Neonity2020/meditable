# Bubble Toolbar 插件设计

- 状态: Draft
- 日期: 2026-04-29
- 作者: montisan + Claude
- 类型: 新功能(插件)

## 1. 背景与目标

MEditable 当前所有 inline 格式化操作(加粗、斜体、下划线、删除线、高亮、行内代码、行内数学公式、上标、下标)都只能通过快捷键触发,见 `src/packages/modules/content/commands/inline.ts`。这对鼠标用户和不熟快捷键的用户不友好。

本设计引入一个 **bubble toolbar 插件**:用户用鼠标或键盘选中一段文本后,在选区附近浮现一条工具栏,鼠标点击或键盘导航即可触发上述 inline 格式化。

### 目标(In Scope)

- 通过插件机制接入(`MEditable.use(MEPluginBubbleToolbar)`),不改动核心模块
- 默认覆盖 `inline.ts` 中的 9 个命令
- 支持 `BubbleToolbarOptions.items` 自定义按钮顺序、增删、注入自定义按钮
- 按钮"激活态"高亮:选区已应用某格式时,按钮显示为 active
- 智能定位:默认上方,空间不够翻到下方;水平 clamp 到视口
- 完整键盘可访问性:Tab 进入、Arrow 切换、Enter/Space 触发、Esc 关闭

### 非目标(Out of Scope, v1)

- 移动端 / 触屏支持(架构上预留,v1 只做桌面)
- Shadow DOM 容器支持
- 块级转换按钮(转标题、引用、列表)
- 链接按钮(可作为 v1.1 的自定义按钮示例)
- 工具栏主题(暗色模式等),v1 跟随编辑器自身样式

## 2. 用户使用方式

```ts
import MEditable, { MEPluginBubbleToolbar } from '@geekeditor/meditable'

// 默认 9 项
MEditable.use(MEPluginBubbleToolbar)

// 自定义
MEditable.use(MEPluginBubbleToolbar, {
  items: [
    'bold', 'italic', 'underline',
    '|',                                  // 分隔符
    'inline_code',
    {                                     // 自定义按钮
      cmdName: 'link',
      tooltip: '插入链接',
      icon: '<svg>...</svg>',
      isActive: ({ formats }) => formats.some(f => f.type === 'link'),
    },
  ],
  showDelay: 150,
  offset: 8,
})
```

## 3. 架构与文件布局

```
src/packages/plugins/bubbleToolbar/
├── index.ts          # MEPluginBubbleToolbar 主类 (Plugin 层)
├── toolbar.ts        # Toolbar UI 类 (DOM + 定位 + 键盘导航)
├── buttons.ts        # DEFAULT_ITEMS + resolveItems + getActiveMap
├── icons.ts          # 9 个内联 SVG 字符串常量
└── index.less        # 样式
```

并在 `src/packages/plugins/index.ts` 导出 `MEPluginBubbleToolbar`。

### 与现有模块的耦合

```
MEditable.use(MEPluginBubbleToolbar, options?)
        │
        ▼
context.plugin.plugins['bubbleToolbar']  (MEPluginBase 子类)
        │
        ├─ subscribe ─▶ context.event ('selectionchange'/'mouseup'/'keyup')
        ├─ invoke    ─▶ context.command.execCommand(cmdName)
        ├─ read      ─▶ context.editable.selection / instance.getCursor()
        └─ reuse     ─▶ commands/format.ts:getFormatsInRange
```

### 职责划分

- **`index.ts` (Plugin 指挥者)**:订阅事件、节流、调用 `getActiveMap`、通知 Toolbar 显隐与更新。**不直接碰 DOM**。继承 `MEPluginBase`,享受 `mutableListeners` 的自动清理。
- **`toolbar.ts` (Toolbar UI)**:纯 UI 类,不知道 MEditable 存在。只暴露 `show / update / hide / destroy` 四个方法 + 一个 `(cmdName) => void` 回调。**这层独立可测**,给假数据即可单测。
- **`buttons.ts`**:数据 + 纯函数。`DEFAULT_ITEMS`、`resolveItems()`、`getActiveMap()`、`defaultIsActive()`。
- **`icons.ts`**:9 个 SVG 字符串常量。

## 4. 组件接口

### 4.1 Plugin

```ts
// src/packages/plugins/bubbleToolbar/index.ts

export interface BubbleToolbarOptions {
  items?: Array<string | '|' | CustomButtonItem>  // 默认 DEFAULT_ITEMS
  showDelay?: number   // selectionchange debounce, 默认 150
  offset?: number      // toolbar 与选区的间距 px, 默认 8
}

export interface CustomButtonItem {
  cmdName: string
  tooltip?: string
  icon: string                                       // SVG 字符串
  isActive?: (ctx: { formats: MENodeData[] }) => boolean
  isEnabled?: (ctx: { formats: MENodeData[] }) => boolean
}

export default class MEPluginBubbleToolbar extends MEPluginBase {
  static pluginName = 'bubbleToolbar'

  private toolbar!: Toolbar
  private items!: ResolvedItem[]
  private cachedCursor: MECursorState | null = null
  private updateScheduled!: () => void   // debounce 包装

  async prepare(): Promise<boolean>
  destroy(): void

  private handleSelectionChange(): void
  private handleScroll(): void                       // rAF 节流
  private execCmd(cmdName: string): void
}
```

### 4.2 Toolbar

```ts
// src/packages/plugins/bubbleToolbar/toolbar.ts

export interface ToolbarItem {
  cmdName: string         // '|' = 分隔符
  tooltip: string
  icon: string
}

export default class Toolbar {
  private el: HTMLElement
  private buttonEls: Map<string, HTMLButtonElement>
  private focusableButtons: HTMLButtonElement[]      // 已剔除分隔符
  private focusedIndex: number = 0
  private offset: number

  constructor(items: ToolbarItem[], opts: {
    offset: number
    onClick: (cmdName: string) => void
  })

  show(rect: DOMRect, activeMap: Record<string, boolean>): void
  update(activeMap: Record<string, boolean>): void   // 不重定位
  hide(): void
  destroy(): void

  get visible(): boolean
  get rootEl(): HTMLElement                          // 给 Plugin 判断 activeElement

  private position(rect: DOMRect): void
  private setFocus(index: number): void
  private handleKeydown(e: KeyboardEvent): void
}
```

#### 定位算法

```
const tbRect = el.getBoundingClientRect()

// 水平
let x = rect.left + rect.width / 2 - tbRect.width / 2
x = Math.max(8, Math.min(x, viewport.width - tbRect.width - 8))

// 垂直: 优先上方
let y = rect.top - tbRect.height - offset
if (y < 8) {
  y = rect.bottom + offset                           // 翻到下方
}

el.style.transform = `translate3d(${x}px, ${y}px, 0)`
```

使用 `position: fixed` + `transform`,GPU 友好且重排少。

### 4.3 Buttons 数据层

```ts
// src/packages/plugins/bubbleToolbar/buttons.ts

import { COMMAND_TYPE_MAP } from '@/packages/modules/content/commands/inline'
import { getFormatsInRange } from '@/packages/modules/content/commands/format'

export const DEFAULT_ITEMS: string[] = [
  'bold', 'italic', 'underline', 'strikethrough',
  '|',
  'inline_code', 'inline_math',
  '|',
  'mark', 'subscript', 'superscript',
]

export interface ResolvedItem {
  cmdName: string                                    // '|' = 分隔符
  tooltip: string
  icon: string
  isActive: (ctx: ActiveCtx) => boolean
  isEnabled: (ctx: ActiveCtx) => boolean
}

interface ActiveCtx {
  formats: MENodeData[]                              // getFormatsInRange().formats
}

export function resolveItems(
  raw: BubbleToolbarOptions['items'],
  registeredCmds: Set<string>,                       // 来自 command.commands 的 keys
): ResolvedItem[]

export function defaultIsActive(cmdName: string): (ctx: ActiveCtx) => boolean
// 实现: formats.some(f => f.type === COMMAND_TYPE_MAP[cmdName] || f.type === cmdName)

export function getActiveMap(
  items: ResolvedItem[],
  cursor: MECursorState,
  contentData: MEBlockData,
): Record<string, boolean>
// 实现:
//   1. 从 cursor 拿 anchorBlockId/focusBlockId 和 offsets
//   2. 找出选区覆盖的所有 block(可能跨块)
//   3. 对每个 block 调 getFormatsInRange,得到该 block 的 formats
//   4. 多 block 取交集语义: 任一片段不含某格式 → activeMap[cmdName] = false
//   5. 异常 try/catch,该项置 false 并 console.warn
```

## 5. 数据流

### 5.1 主线 A:选区改变 → toolbar 显示/更新/隐藏

```
mouseup / keyup / selectionchange
        │ context.event.on(...)
        ▼
Plugin.handleSelectionChange()  ← debounce(showDelay)
        │
        ▼
guards:
  - range.collapsed                  → hide; return
  - activeElement ∈ toolbar.rootEl   → return  // 别隐藏自己
  - !editable.actived                → hide; return
  - block.type ∈ BLACKLIST           → hide; return
  - 选区只含空白/fillChar             → hide; return
        │
        ▼
const cursor = instance.getCursor()
const rect   = range.getBoundingClientRect()  (退化用 getClientRects()[0])
const activeMap = getActiveMap(items, cursor, content.data)
        │
        ▼
toolbar.show(rect, activeMap)   // visible 时也走 show,内部覆盖位置 + 激活态
```

### 5.2 主线 B:按钮触发

```
button.onmousedown → e.preventDefault()    // 保住编辑器选区(鼠标路径)
button.onclick      ┐
button.onkeydown    ├──▶ Toolbar.handleActivate(cmdName)
  (Enter/Space)     ┘            │ onClick 回调
                                  ▼
                          Plugin.execCmd(cmdName)
                                  │
                                  ▼
   ┌──────────────────────────────────────────────────────┐
   │ if (cachedCursor && document.activeElement ∈ toolbar)│
   │   instance.setCursor(cachedCursor)                  │
   │ context.command.execCommand(cmdName)                │
   └──────────────────────────────────────────────────────┘
                                  │
                                  ▼
        command.execCommand 触发 'afterexeccommand' + selectionChange
                                  │
                                  ▼
                  主线 A 自动跑一遍,刷新 activeMap
```

### 5.3 主线 C:键盘焦点进入 toolbar

```
toolbar.rootEl.addEventListener('focusin', ...)
        │
        ▼
  if (!cachedCursor) cachedCursor = instance.getCursor()

toolbar.rootEl.addEventListener('focusout', e => {
  if (!toolbar.rootEl.contains(e.relatedTarget))
    cachedCursor = null   // 焦点彻底离开 toolbar 才清
})
```

### 5.4 主线 D:滚动/resize 重定位

```
window.scroll / resize  → Plugin.handleScroll()  (rAF 节流)
        │
        ▼
if (!toolbar.visible) return
const range = selection.getRangeAt(0)              // 滚动时实时取
if (!range || range.collapsed)             → hide
const rect = range.getBoundingClientRect()
if (rect 完全在视口外)                      → hide
else                                       → toolbar.show(rect, lastActiveMap)
```

### 5.5 节流策略

| 入口 | 节流 |
|---|---|
| selectionchange / mouseup / keyup | **debounce showDelay (默认 150ms)** |
| scroll / resize | **requestAnimationFrame** |
| afterexeccommand 引发的 selectionchange | 复用主线 A 的同一个 debouncer |

## 6. 键盘可访问性(WAI-ARIA Toolbar 模式)

### 6.1 语义

- Toolbar 容器: `role="toolbar"`, `aria-label="格式化"`(走 i18n)
- 按钮: 原生 `<button>`,`aria-pressed` 反映激活态,`aria-disabled` 反映 enabled
- 分隔符: `role="separator"` `aria-orientation="vertical"`

### 6.2 Roving Tabindex

- 第一个可激活按钮 `tabindex=0`,其余 `tabindex=-1`
- 焦点切换时,旧的设为 `-1`、新的设为 `0`,然后 `newBtn.focus()`
- 这样 Shift+Tab 一次性跳出 toolbar(标准行为)

### 6.3 按键映射

| 按键 | 行为 |
|---|---|
| Tab(从编辑器) | 焦点进入 toolbar 第一个按钮(浏览器原生,因 tabindex) |
| ArrowLeft / ArrowRight | 移到上/下一个按钮,跳过分隔符,首尾循环 |
| Home / End | 跳到第一个 / 最后一个 |
| Enter / Space | 触发当前按钮 |
| Escape | hide toolbar 并把焦点还给编辑器 |
| Shift+Tab | 离开 toolbar(浏览器原生) |

### 6.4 选区保存恢复

- `mousedown.preventDefault()` 保鼠标路径选区(焦点不离开编辑器)
- `focusin` 时缓存 `cachedCursor`,`execCmd` 前 `instance.setCursor(cachedCursor)` 恢复(键盘路径)

## 7. 边界场景与错误处理

### 7.1 选区相关

| 场景 | 行为 |
|---|---|
| 选区跨多个 block | 仍显示;`getActiveMap` 多 block 取交集(任一片段不含 → 非激活) |
| 选区落在 `code_block` / `math_block` / `frontmatter` 等不可格式化 block | toolbar 不显示。黑名单 `BLACKLIST_BLOCK_TYPES = ['code_block', 'math_block', 'diagram_block', 'html_block', 'frontmatter']`,在 `buttons.ts` 中以常量形式导出,方便后续扩展 |
| 选区在 `inline_code` / `inline_math` 内部 | toolbar 显示,但只激活当前类型按钮,其他按钮 disabled |
| 选区只含空白或 fillChar | 视为空,hide |

### 7.2 焦点 & 生命周期

| 场景 | 行为 |
|---|---|
| editor.destroy() | Plugin.destroy → toolbar.destroy → 移除 body DOM,解绑所有 listener |
| 多 MEditable 实例 | 各自一个 toolbar DOM,挂在 body 下,互不影响 |
| `editable.actived === false` | 主线 A 直接 hide |
| Shadow DOM 容器(`rootNode.nodeType === 11`) | v1 不支持。`prepare()` 内 `console.warn` 并退化 mount 到 `editable.holder.offsetParent` |

### 7.3 异常防御

| 场景 | 处理 |
|---|---|
| `range.getBoundingClientRect()` 返回零矩形 | 退化 `range.getClientRects()[0]`,仍为零则 hide |
| `getFormatsInRange` 抛错 | try/catch,activeMap 全 false,`console.warn`(**不静默吞**) |
| `command.execCommand` 抛错 | 不 catch,向上抛 |
| 自定义 `isActive` 抛错 | try/catch,该项 false + warn |
| 未注册的 cmdName | `prepare()` 时校验,跳过 + warn |

### 7.4 与现有模块潜在冲突

| 来源 | 处理 |
|---|---|
| `contextMenu` 插件 | 无重叠 |
| `dragdrop`(图片拖拽) | collapsed 判断已兜底 |
| `search` 高亮 | v1 不特殊处理(选区不 collapsed,toolbar 自然显示) |
| `stack`(undo/redo) | restore 触发 selectionchange,主线 A 自动重算 |

## 8. 测试策略

### 8.1 分层

| 层 | 工具 |
|---|---|
| 纯函数单元(`buttons.ts`) | jest |
| Toolbar 单元(jsdom) | jest + jsdom |
| Plugin 集成 | jest + jsdom + 真 MEditable 实例 |
| 手动测试 | dev server (`npm run dev`) |

### 8.2 单元: `buttons.test.ts`

```
resolveItems
- 默认值 = DEFAULT_ITEMS
- 字符串 cmdName 自动补全 tooltip 和 icon
- '|' 解析为分隔符项
- 未注册 cmdName 被过滤并 warn
- 自定义 CustomButtonItem 完整透传 isActive

getActiveMap
- 单 block,选区完全包在 <strong> 里 → bold:true
- 跨两 block,A 全粗 / B 不粗 → bold:false
- 选区在 inline_code 内 → inline_code:true,其他全 false
- formats 为空 → 全部 false
- isActive 抛错 → 该项 false + warn
```

### 8.3 Toolbar: `toolbar.test.ts`

```
show / hide / destroy
positioning (mock getBoundingClientRect + viewport size)
roving tabindex (Arrow / Home / End / wrap / 跳过分隔符)
Enter / Space → onClick(cmdName)
update({...}) 加/去 active class,不改位置
```

### 8.4 集成: `plugin.test.ts`

```
- 选区 collapsed → toolbar 隐藏
- 非空选区 + selectionchange → toolbar 显示且 9 按钮齐
- 选区跨 **world** → bold 按钮 active
- 点击 italic → execCommand 被调用,内容更新
- Tab 进 toolbar → cachedCursor 已记录
- Enter 触发 → setCursor 恢复 + execCommand
- editor.destroy() → toolbar DOM 从 body 移除
- items 自定义过滤生效
- items 含未知 cmdName → warn 且跳过
```

### 8.5 前置准备(实施时第一步)

确认 jsdom 下 MEditable 能跑通。已知依赖:`ResizeObserver`(`layout.ts:44`),需在 `jest.config.js` setup 里 polyfill。其他 API(MutationObserver、Selection)jsdom 自带或可 mock。

### 8.6 不测什么

- 样式像素值(主观)
- 真实 SVG 内容(只测 button 内含 svg)
- v1 不测移动端 / Shadow DOM
- 不重测 `commands/format.ts` 自身的格式化逻辑

## 9. 实施粒度建议(供 writing-plans 参考)

1. 准备:jsdom polyfill ResizeObserver,确认现有 `state.test.js` 不被打断
2. `icons.ts` + `buttons.ts`(纯数据 + 纯函数,带单测)
3. `toolbar.ts`(独立 UI 类,带单测)
4. `index.ts`(Plugin 指挥层,带集成测)
5. `index.less` + 在 `plugins/index.ts` 导出 + 在 `src/index.ts` 接入演示
6. 手动跑 `npm run dev` 走清单

## 10. 已显式拒绝的设计选择(以及原因)

- 把 toolbar 做成内置模块而不是插件 —— 跟"以插件方式嵌入"的需求矛盾,且违反 YAGNI
- 让用户自行实现 toolbar UI(只暴露 `getSelectionRect`)—— 开箱即用度归零,跟需求不符
- 用第三方图标库 —— bundle 已经够大,9 个内联 SVG 足够
- 鼠标松开点为锚定位置 —— 键盘选区 / 长选区不友好
- 不做激活态高亮 —— 跟 WYSIWYG 定位违和
