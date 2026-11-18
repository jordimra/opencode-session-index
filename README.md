# session-index

TUI plugin for **OpenCode v2+** that adds an interactive index to the sidebar with all your prompts from the current session. It lets you scroll through your prompt history and jump directly to any turn in the main conversation with a single click.

## Features

- **Real-time prompt index:** Displays every prompt sent during the session along with its turn number and timestamp.
- **Compact scrollable viewport:** Occupies a fixed area in the sidebar with mouse scroll support without cluttering the interface.
- **Lightweight pagination:** Loads prompts in batches from newest to oldest to preserve performance during long sessions.
- **Direct jump with auto-pagination:** Clicking any prompt scrolls the main conversation directly to that message (automatically loading older batches if it was out of view).
- **Return to bottom:** The **+ New prompt** row scrolls the main conversation to the very end (same effect as TUI's *Jump to latest*) to compose a new prompt.
- **100% native TUI:** Works seamlessly in both local sessions and when connected to a remote OpenCode server.

## Requirements

- **OpenCode v2.0** or higher (TUI interface).

## Installation

Add the package to the `plugins` array in your global (`~/.config/opencode/cli.json`) or local project (`.opencode/cli.json`) configuration:

```json
{
  "plugins": ["session-index"]
}
```

Restart `opencode` after adding it to load the component.

> **Note:** The `id` defined in the plugin code is `"session-index"`. Use that value in the `plugins` array. If the plugin is published as an npm package under a different name, adjust the value according to the registry.

## Usage

1. Open any session in `opencode` and ensure the sidebar is visible (`Ctrl+X` followed by `B`).
2. In the **Prompts** section of the sidebar, your prompts are listed chronologically.
3. **Scrolling:** Hover over the list and use the mouse wheel to scroll through earlier and later prompts.
4. **Load history:** If the session contains many turns, click **↑ Load older** at the top of the list to expand the visible batch.
5. **Direct navigation:** **Left-click** any entry to jump immediately to that prompt in the main view.
6. **Return to bottom:** Click **+ New prompt** (last row of the index) to scroll to the end of the conversation, identical to *Jump to latest*.

## Local Development

Clone the repository and register the local path during development:

```bash
git clone <REPOSITORY-URL>
cd session-index
```

Add the absolute path in `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["/absolute/path/to/session-index"]
}
```

Verify that the OpenCode plugin loader accepts local filesystem paths; otherwise, link the package via npm (`npm link`) or publish it to the corresponding registry.

## License

MIT
