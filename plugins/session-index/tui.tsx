/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"

// Visible rows in the index viewport
const WINDOW_ROWS = 10
// Page size when loading older questions in the sidebar
const PAGE_SIZE = 15
// Maximum line width (in characters) displayed for each entry,
// including the trailing "…" when text is truncated
const MAX_LINE_LENGTH = 37

/** Synthetic wheel event (@opentui/core RawMouseEvent shape). The TUI only
 * loads history (revealOlderRows) from onMouseScroll; a programmatic scrollTo
 * does not trigger it, so the jump emits it manually. */
function wheelUpEvent(): any {
  return {
    type: "scroll",
    button: 0,
    x: 0,
    y: 0,
    modifiers: { shift: false, alt: false, ctrl: false },
    scroll: { direction: "up", delta: 3 },
  }
}

type IndexEntry = {
  number: number
  id: string
  preview: string
}

function getMessageText(context: Plugin.Context, sessionID: string, msg: any): string {
  const storeParts = context.data.session.part?.list?.(sessionID, msg.id)
  if (Array.isArray(storeParts) && storeParts.length > 0) {
    const textPart =
      storeParts.find(
        (p: any) => p.type === "text" && !p.synthetic && typeof p.text === "string" && p.text.trim(),
      ) ??
      storeParts.find((p: any) => p.type === "text" && typeof p.text === "string" && p.text.trim())
    if (textPart?.text) return textPart.text
  }

  const embedded = Array.isArray(msg.parts)
    ? msg.parts
    : Array.isArray(msg.content)
      ? msg.content
      : []
  const embeddedText = embedded.find(
    (p: any) => p.type === "text" && typeof p.text === "string" && p.text.trim(),
  )
  if (embeddedText?.text) return embeddedText.text

  if (typeof msg.text === "string" && msg.text.trim()) return msg.text
  return ""
}

/** Truncates `text` to MAX_LINE_LENGTH; if it exceeds, character 37 is "…". */
function truncateLine(text: string): string {
  return text.length > MAX_LINE_LENGTH
    ? `${text.slice(0, MAX_LINE_LENGTH - 1)}…`
    : text
}

function extractUserQuestions(
  context: Plugin.Context,
  sessionID: string,
  messages: ReadonlyArray<any>,
): IndexEntry[] {
  const entries: IndexEntry[] = []
  let count = 0

  for (const msg of messages) {
    if (msg.type !== "user") continue

    const rawText = getMessageText(context, sessionID, msg).trim()
    const firstLine = rawText
      .split("\n")
      .map((line: string) => line.replace(/^[#>*\-`\s]+/, "").trim())
      .find((line: string) => line.length > 0)

    count += 1
    // Keep the entire first line; truncation to MAX_LINE_LENGTH is applied
    // during rendering, as the total width also depends on "#No."
    const preview = firstLine ?? "(Attachment or command)"

    entries.push({
      number: count,
      id: msg.id ?? String(count),
      preview,
    })
  }

  return entries
}

function SessionIndexSidebar(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE)
  const [isJumping, setIsJumping] = createSignal(false)
  let rootRef: any

  // Reset pagination and cancel pending jumps when switching sessions
  createEffect(() => {
    const _id = props.sessionID
    setVisibleCount(PAGE_SIZE)
    setActiveId(null)
    setIsJumping(false)
  })

  const allEntries = createMemo(() => {
    const messages = props.context.data.session.message.list(props.sessionID)
    return extractUserQuestions(props.context, props.sessionID, messages)
  })

  const pagedEntries = createMemo(() => {
    const total = allEntries().length
    const start = Math.max(0, total - visibleCount())
    return allEntries().slice(start)
  })

  const hiddenCount = createMemo(() => Math.max(0, allEntries().length - pagedEntries().length))

  function getRootNode() {
    let root = rootRef
    while (root?.parent) {
      root = root.parent
    }
    return root
  }

  function findMainScrollBox(root: any) {
    // Search backward from the most recent question for a mounted node in the main chat
    const list = allEntries()
    for (let i = list.length - 1; i >= 0; i--) {
      const node = root?.findDescendantById?.(list[i].id)
      if (node) {
        let parent = node.parent
        while (parent && typeof parent.scrollChildIntoView !== "function") {
          parent = parent.parent
        }
        if (parent) return parent
      }
    }
    return null
  }

  function loadMoreOlder() {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }

  function jumpToLatest() {
    const root = getRootNode()
    if (!root) return
    const mainScroll = findMainScrollBox(root)
    if (!mainScroll || typeof mainScroll.scrollTo !== "function") return

    // Same behavior as TUI's "Jump to latest" (toBottom): pin scroll
    // to the bottom of the history; native indicator hides upon reaching bottom
    // and stickyScroll keeps the view pinned if new messages arrive
    mainScroll.stickyScroll = true
    setTimeout(() => {
      if (mainScroll.isDestroyed) return
      mainScroll.scrollTo(mainScroll.scrollHeight ?? 0)
    }, 50)
  }

  async function jumpToQuestion(entry: IndexEntry) {
    setActiveId(entry.id)
    const root = getRootNode()
    if (!root) return

    // 1. If already mounted in the main window, jump directly
    const immediateNode = root.findDescendantById?.(entry.id)
    if (immediateNode) {
      let scrollParent = immediateNode.parent
      while (scrollParent && typeof scrollParent.scrollChildIntoView !== "function") {
        scrollParent = scrollParent.parent
      }
      if (scrollParent?.scrollChildIntoView) {
        scrollParent.scrollChildIntoView(immediateNode)
        return
      }
    }

    // 2. If out of range, force upward pagination of the main chat
    if (isJumping()) return
    const mainScroll = findMainScrollBox(root)
    if (!mainScroll || typeof mainScroll.scrollTo !== "function") return

    setIsJumping(true)
    const targetSession = props.sessionID

    try {
      let lastHeight: number | undefined
      let stalled = 0
      for (let attempt = 0; attempt < 40; attempt++) {
        // Abort if the user switched sessions or selected another question
        if (props.sessionID !== targetSession || activeId() !== entry.id) break

        // If the node mounted since the last tick, jump and finish without
        // moving scroll (avoids shifting the view away before jumping)
        const loadedNode = root.findDescendantById?.(entry.id)
        if (loadedNode) {
          mainScroll.scrollChildIntoView(loadedNode)
          break
        }

        // Scroll to top edge to trigger loading the previous batch;
        // does not disturb the view if already at top
        if (typeof mainScroll.scrollTop !== "number" || mainScroll.scrollTop > 0) {
          mainScroll.scrollTo(0)
        }
        // The TUI only loads history from actual mouse wheel events (revealOlderRows):
        // emit synthetic event onto the transcript scrollbox
        mainScroll.onMouseScroll?.(wheelUpEvent())
        await new Promise((resolve) => setTimeout(resolve, 60))

        // No progress (same content height and already at top) for 5 ticks:
        // no more history to load; exit in ~300 ms instead of exhausting all 40 attempts
        const height = mainScroll.scrollHeight
        const top = mainScroll.scrollTop
        stalled = height === lastHeight && top === 0 ? stalled + 1 : 0
        lastHeight = height
        if (stalled >= 5) break
      }
    } finally {
      setIsJumping(false)
    }
  }

  return (
    <Show when={allEntries().length > 0}>
      <box
        ref={(el: any) => {
          rootRef = el
        }}
        flexDirection="column"
        marginTop={1}
      >
        <text fg={theme.text.base}>
          <b>Prompts</b>
        </text>

        <scrollbox
          height={WINDOW_ROWS}
          flexDirection="column"
        >
          <Show when={hiddenCount() > 0}>
            <box onMouseUp={loadMoreOlder}>
              <text fg={theme.text.accent ?? theme.text.base}>
                ↑ Load older ({hiddenCount()} more)
              </text>
            </box>
          </Show>

          <For each={pagedEntries()}>
            {(entry) => {
              const isSelected = () => activeId() === entry.id
              // Full line "#No. preview" truncated to MAX_LINE_LENGTH.
              // Prefix "#No." is never truncated (line only truncates
              // when preview exceeds width), so it can render with its own style.
              const numberLabel = `#${entry.number}`
              const rest = truncateLine(`${numberLabel} ${entry.preview}`).slice(
                numberLabel.length,
              )
              return (
                <box
                  onMouseUp={() => jumpToQuestion(entry)}
                  backgroundColor={isSelected() ? theme.background.element : undefined}
                >
                  <text fg={isSelected() ? theme.text.base : theme.text.muted}>
                    <span fg={theme.text.base}>{numberLabel}</span>
                    {rest}
                  </text>
                </box>
              )
            }}
          </For>

          <box onMouseUp={jumpToLatest}>
            <text fg={theme.text.accent ?? theme.text.base}>+ New prompt</text>
          </box>
        </scrollbox>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "session-index",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SessionIndexSidebar context={context} sessionID={props.sessionID} />,
    })
  },
})
