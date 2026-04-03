# Multiline Text Resize Handle

## What changed

- Added a dedicated bottom-right resize handle for wrapped multiline text when the editor is in `textmultiline` mode.
- Kept normal select-mode behavior unchanged: the regular selection grips still only appear in `select` mode.
- Updated multiline frame resizing so dragging the handle changes:
  - `data-svgedit-wrap-width`
  - `data-svgedit-wrap-height`
  - the visible selector frame
  - the backing `<defs>` rect referenced by `data-svgedit-shape-inside-ref`
- Reflowed multiline `<tspan>` content live as the frame size changes.
- Added e2e coverage for creating a multiline box and resizing it through the new handle.

## Interesting details

- The first implementation issue was not the frame geometry. The backing rect was already moving with the text because it is tied to the wrapped-text model; the missing piece was a separate interaction path for resizing while still in the multiline tool.
- The resize handle had to live in the selector layer, but it could not reuse the normal selection grips because those must remain untouched in regular select mode.
- Event routing needed a small but important change: the generic selector-grip logic was converting all selector hits into the selected element too early, which prevented the new multiline-only grip from being recognized.
- Undo/redo needed explicit synchronization of the backing frame rect, otherwise the text attributes could roll back while the hidden frame rect stayed stale.
- The Playwright test also needed care because mouse coordinates are page-relative, not SVG-relative. Using `#svgroot`'s bounding box was necessary to hit the intended canvas position reliably.

## Files touched

- `packages/svgcanvas/core/event.js`
- `packages/svgcanvas/core/select.js`
- `packages/svgcanvas/core/multiline-text.js`
- `packages/svgcanvas/core/undo.js`
- `src/editor/panels/LeftPanel.js`
- `tests/e2e/multiline-text.spec.js`

## Verification

- `XDG_CACHE_HOME=/tmp npx standard packages/svgcanvas/core/event.js packages/svgcanvas/core/select.js packages/svgcanvas/core/multiline-text.js packages/svgcanvas/core/undo.js src/editor/panels/LeftPanel.js tests/e2e/multiline-text.spec.js`
- `XDG_CACHE_HOME=/tmp npm run build --workspace @svgedit/svgcanvas`
- `npx playwright test tests/e2e/multiline-text.spec.js`
