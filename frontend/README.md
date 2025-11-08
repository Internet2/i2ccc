# CICP Chatbot Frontend

React + TypeScript + Vite application that powers the Internet2 Cloud Assistant interface. The UI is optimized for chat-based knowledge retrieval, including quick navigation, markdown rendering, and a theme-aware layout.

## Quick start

```bash
pnpm install
pnpm dev
```

By default the development server runs at <http://localhost:5173>. Use `pnpm build` to produce a production bundle.

## Features

- **Dark mode toggle** in the top-right corner that persists your preference and mirrors the design tokens defined in `docs/DARKMODE_COLOR_PLAN.md`.
- **Responsive chat shell** with collapsible history sidebar and mobile-friendly navigation.
- **Rich assistant responses** rendered with markdown, code blocks, and source references.

## Dark mode implementation notes

- Core colors are expressed as CSS variables in `src/index.css`, with light and dark values matching the shared color plan.
- Toggling updates the `dark` class on the root element and stores the preference in `localStorage` under `i2-theme`.
- Components use semantic classes (for example `var(--color-surface)`, `var(--color-text-secondary)`) so both themes stay in sync.

## Testing & linting

- `pnpm build` &mdash; type-checks the project and emits the production build.
- `pnpm lint` &mdash; runs ESLint with the project rules.

Feel free to extend the Tailwind configuration or typography plugin if you need additional theme-aware utilities.
