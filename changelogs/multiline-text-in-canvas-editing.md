# Multiline Text In-Canvas Editing

## What changed

- Replaced the old visible top-bar multiline editing workflow with in-canvas multiline text editing.
- Kept the existing multiline text model intact:
  - `data-svgedit-raw-text`
  - `data-svgedit-multiline`
  - `data-svgedit-wrap-width`
  - `data-svgedit-wrap-height`
  - backing frame rects in `<defs>`
- Routed multiline text creation and double-click editing through `textActions`, like single-line text.
- Converted the multiline input into a hidden editing layer instead of a visible toolbar control.
- Added SVG-based caret rendering for multiline editing so the visible caret follows the rendered wrapped text instead of the browser textarea layout.
- Added e2e coverage for multiline in-place editing and for keeping the visible caret inside the wrapped frame.

## Learnings

- The biggest mistake was treating multiline editing as “just a textarea overlay”. That is good enough for input capture, but not good enough for visual fidelity.
- Browser textarea layout is not a reliable source of truth for the visible caret when SVG text is being laid out separately with `<tspan>` nodes. Even small differences in alignment, metrics, or wrapping will show up immediately.
- The correct source of truth for multiline caret placement is the rendered SVG text itself.
- Positioning also needed care: viewport coordinates for the hidden input and SVG-root coordinates for the visible cursor are different spaces. Mixing them caused the cursor to appear far from the text.
- Styling needed to come from SVG semantics, not generic page CSS. In particular, multiline alignment had to map from SVG `text-anchor` instead of inheriting browser `text-align`.
- Hiding the input is not only about `display: none`. When the editor transitions between modes, it is safer to also park the input offscreen and disable pointer events so it cannot flash in the wrong place.

## Files touched

- `packages/svgcanvas/core/text-actions.js`
- `packages/svgcanvas/core/elem-get-set.js`
- `packages/svgcanvas/core/event.js`
- `src/editor/EditorStartup.js`
- `src/editor/panels/TopPanel.js`
- `src/editor/svgedit.css`
- `tests/unit/text-actions.test.js`
- `tests/e2e/multiline-text.spec.js`

## Verification

- `XDG_CACHE_HOME=/tmp/codex-cache npx standard packages/svgcanvas/core/text-actions.js packages/svgcanvas/core/elem-get-set.js packages/svgcanvas/core/event.js src/editor/EditorStartup.js src/editor/panels/TopPanel.js tests/unit/text-actions.test.js tests/e2e/multiline-text.spec.js`
- `XDG_CACHE_HOME=/tmp/codex-cache npx vitest run tests/unit/text-actions.test.js`
- `npm run build`
- `npx playwright test tests/e2e/multiline-text.spec.js`
