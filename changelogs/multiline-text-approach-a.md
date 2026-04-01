# Multiline Text Integration (Approach A)

## What was implemented

- Added `@chenglou/pretext` integration for line layout and wrapping.
- Added a multiline text model in `svgcanvas` (`data-svgedit-raw-text`, `data-svgedit-multiline`, optional wrap/line-height attrs).
- Added multiline rendering logic that converts authored text into `<tspan>` lines on a `<text>` element.
- Added detection/helpers for multiline elements so editor code can route them differently than legacy single-line text.
- Updated text editing flow:
  - legacy single-line text tool/input still works,
  - multiline tool creates multiline-enabled text,
  - multiline textarea input commits into tspans.
- Added a left-toolbar multiline text entry (`tool_text_multiline`) and top-panel textarea (`#text_multiline`).
- Updated event and text action plumbing so multiline elements avoid the old in-canvas single-line caret path.
- Added e2e regression coverage that verifies multiline textarea input produces multiple `<tspan>` nodes.

## How it works

1. User chooses **Text** (legacy) or **Multiline text** (new toolbar entry).
2. In multiline mode, newly created text is marked with `data-svgedit-multiline="true"`.
3. Typing in `#text_multiline` updates selected text via `setTextContent`.
4. `setTextContent` detects multiline input/element state and calls multiline layout.
5. Layout uses pretext (`prepareWithSegments` + `layoutWithLines`) with `whiteSpace: 'pre-wrap'`.
6. The `<text>` content is replaced with one `<tspan>` per line (`x` + `dy` stacking).
7. Raw authored content is preserved for re-editing (`data-svgedit-raw-text`).

## Notes

- This is the Approach A path: commit-based multiline editing through panel UI, with explicit SVG `<tspan>` output for export reliability.
- Legacy single-line behavior remains available through the original text tool and hidden text input.
