# Wrapped text box (SVG 2 + SVG 1.1 fallback) implementation plan

## Goal for first step
Implement a **drag-to-create text frame** workflow in SVG-Edit that:

1. Lets users drag a rectangle-like text frame (Inkscape-style first step).
2. Stores wrapped-text intent on `<text>` (authoring metadata).
3. Materializes visible lines as `<tspan>` children so legacy renderers still show readable text.

This intentionally prioritizes a compatible MVP over full SVG 2 layout parity.

---

## What already exists in this codebase we can reuse

- A multiline model already exists (`data-svgedit-multiline`, raw text, wrap width, line height) and rendering to `<tspan>` lines is implemented in `applyMultilineText()`.  
  - `packages/svgcanvas/core/multiline-text.js`
- A multiline text tool mode already exists (`tool_text_multiline`) and toggles `svgCanvas.useMultilineText`.  
  - `src/editor/panels/LeftPanel.js`
- Text creation currently places a point text element (`x`,`y`) and does not create a frame via drag geometry.  
  - `packages/svgcanvas/core/event.js`
- Multiline text entry UI currently exists as a top-panel `<textarea id="text_multiline">` that calls `setTextContent()`.  
  - `src/editor/panels/TopPanel.html`, `src/editor/EditorStartup.js`

So the core fallback rendering path is present; the missing first-step behavior is mainly **drag-frame creation + wrap-width plumbing + initial UX state**.

---

## Proposed MVP behavior

When `tool_text_multiline` is active:

1. **Mouse down** starts a temporary frame rectangle (similar to `rect`/`image` drag behavior).
2. **Mouse move** updates frame geometry (x, y, width, height).
3. **Mouse up** creates/selects a `<text>` anchored at frame top-left with:
   - `data-svgedit-multiline="true"`
   - `data-svgedit-wrap-width="<frame width>"`
   - `x` and `y` at frame origin (+ baseline offset)
4. Editor focuses `#text_multiline`; user types paragraph text.
5. `setTextContent()` reflows into `<tspan>` lines (existing path), producing SVG 1.1-friendly fallback lines.
6. If measured content exceeds frame height, mark overflow state (initially editor-only visual cue).

Note: for first step, frame height can be an editing constraint/indicator even if final SVG stores only wrap width + tspans.

---

## Concrete implementation plan

### Phase 0 — Define data contract (small)

Add/confirm text-frame metadata attributes (editor-owned):

- `data-svgedit-wrap-width` (already used)
- `data-svgedit-wrap-height` (new; for overflow indication)
- Optional: `data-svgedit-frame-x`, `data-svgedit-frame-y` only if needed for UI overlays

Decision: keep output element as real `<text>` + `<tspan>` children (already implemented), not `foreignObject`.

### Phase 1 — Drag-box creation in canvas events (core MVP)

Modify `packages/svgcanvas/core/event.js` in text mode:

- On `mouseDown` with `useMultilineText === true`, create a temporary drag frame element (recommended: a transient `<rect>` in selector/layer helper, not persisted as user content).
- Reuse existing rectangle drag math from `rect/image` branches for geometry updates.
- On `mouseUp`:
  - Compute frame width/height.
  - If drag distance is tiny, apply a sensible default width/height.
  - Create/select `<text>` as today, but set multiline + wrap attributes based on frame.
  - Do **not** call legacy in-canvas single-line `textActions.start()` for multiline.

### Phase 2 — Text anchor + line layout coherence

Use/extend `packages/svgcanvas/core/multiline-text.js`:

- Ensure first-line baseline uses text `y`; subsequent lines use `dy=lineHeight` (already present).
- Set wrap width from `data-svgedit-wrap-width` (already present).
- Keep raw authored text in `data-svgedit-raw-text` (already present).

Add small helper for default baseline inset from frame top (e.g., `font-size`), so text starts inside the box predictably.

### Phase 3 — UI wiring and minimal affordances

- Keep current textarea workflow in `#text_multiline` (already wired in `EditorStartup.js`).
- When a multiline framed text is selected, ensure `text_multiline` is focused after creation (existing `addedNew` behavior can be reused).
- Add a lightweight overflow indicator:
  - Compute estimated rendered height from line count × lineHeight.
  - Compare against `data-svgedit-wrap-height`.
  - Toggle class/state (future red text/frame indicator).

### Phase 4 — Fallback robustness rules

To preserve legacy readability:

- Always materialize current layout into explicit `<tspan>` lines whenever content/font/wrap width changes.
- Keep `x` on each `<tspan>` and stacked `dy` values (already current pattern).
- Do not rely on literal `\n` for rendering semantics.

This gives SVG 1.1 renderers a readable fallback while still allowing future SVG 2 `shape-inside` experiments.

### Phase 5 — Optional progressive SVG 2 feature flag (later)

After MVP stabilizes, add optional export/runtime flag:

- Write `style="shape-inside:url(#...);"` (or inline-size equivalent) for SVG 2-aware consumers.
- Keep generated `<tspan>` fallback in the same `<text>` for compatibility.
- If both shape-inside and width metadata exist, treat shape-inside as primary semantic model.

---

## File-by-file starting points

- `packages/svgcanvas/core/event.js`
  - Add multiline drag-frame lifecycle in `text` mode.
  - Reuse rect drag calculations for geometry.
- `packages/svgcanvas/core/multiline-text.js`
  - Extend with optional frame-height/overflow helpers.
- `src/editor/EditorStartup.js`
  - Keep multiline textarea input path; add overflow status updates on input.
- `src/editor/panels/TopPanel.js` / `TopPanel.html`
  - Optional small UI hint for overflow state.

---

## Test plan (MVP)

1. **Creation behavior**
   - Activate multiline tool, drag frame, release.
   - Assert created `<text>` has multiline and wrap metadata.
2. **Typing + wrapping**
   - Enter long text in `#text_multiline`.
   - Assert multiple `<tspan>` children are generated.
3. **Fallback structure**
   - Assert each `<tspan>` has explicit `x`; stacked by `dy`.
4. **Undo/redo**
   - Drag-create + type + undo + redo should restore metadata and tspans.
5. **Transform safety**
   - Move/scale text element; ensure tspans remain coherent.

Where to add tests first:
- `tests/e2e/text-tools.spec.js` for interaction and generated SVG structure.

---

## Risks and mitigations

- **Risk:** Existing `text` mode assumes point placement, not frame drag.  
  **Mitigation:** Gate new behavior strictly behind `useMultilineText`.

- **Risk:** In-canvas caret model is single-line oriented.  
  **Mitigation:** Keep current panel textarea editing path for multiline (already implemented).

- **Risk:** Cross-renderer wrapping differences.  
  **Mitigation:** Persist explicit tspans on every commit/update.

---

## Suggested execution order

1. Event-layer drag-frame creation for multiline tool only.
2. Attribute plumbing (`wrap-width`, `wrap-height`) into created text nodes.
3. Overflow signal calculation (non-blocking visual).
4. E2E tests for drag-create + multiline tspans.
5. Iterate on UX polish (frame handles, red overflow indicator, optional shape-inside export).
