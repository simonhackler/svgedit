Integrating pretext with SVG-Edit to Support Multiline SVG Text
Executive summary
Feasibility assessment: conditional yes. It is technically feasible to combine the two GitHub projects to add authorable multiline text in SVG-Edit and export it as SVG (most robustly as <text> containing multiple <tspan> elements). The work is “conditional” primarily because SVG-Edit’s current text editing subsystem is architected around single-line assumptions (cursor/selection geometry uses a single Y/height for all glyphs), so a fully WYSIWYG, in-canvas, multiline caret editor will require either a significant refactor or a different editing strategy (e.g., HTML <textarea> overlay).

The core rendering/export side is straightforward: SVG-Edit’s canvas layer already treats text and tspan as visible/allowed element types, and the event flow already creates a <text> element and enters a “textedit” mode.
 The main engineering lift is therefore editing UX + text DOM model + undo/redo semantics.

From the SVG standards side, SVG 2 explicitly defines multiline behavior via CSS white-space (e.g., pre, pre-line) and defines line-height handling for multiline text, and it also defines inline-size for auto-wrapped text.
 However, the SVG 2 spec itself notes browser interoperability concerns for some of these features (e.g., inline-size examples and right-to-left wrapping).
 This makes a tspan-explicit layout (computed by pretext) the most predictable output format for “render-to-SVG” use cases.

Recommended path: implement multiline layout using pretext’s prepareWithSegments() + layoutWithLines() to obtain per-line strings and widths; render each line as a <tspan>; and store the original authoring text and wrap width in SVG-Edit-specific metadata for re-editing.
 Start with a lower-risk editing UI (dialog/side-panel <textarea>), then optionally upgrade to an in-canvas overlay editor.

Current SVG-Edit text handling and where multiline breaks today
Text creation and mode lifecycle in svgcanvas
SVG-Edit’s canvas event system treats “text” as a drawing mode and “textedit” as an editing mode. On mouse movement in text mode, it updates the shape’s x/y.
 On mouse-up, it finalizes the created element and immediately calls svgCanvas.textActions.start(element), entering text editing.
 Mouse move/up are routed differently once in textedit.

This workflow (create <text> → enter textedit) is a strong integration point: multiline support can hook into either:

the creation step (define a “text box width” while creating), and/or
the edit step (replace single-line editing with multiline UI and tspan layout).
The current text editing model is implicitly single-line
The text-actions.js module exposes init(canvas) and a singleton TextActions instance.
 Its editing logic is based on:

a hidden input element (#textinput) which is focused and used for selection ranges (selectionStart/selectionEnd),
SVGTextContentElement geometry queries getStartPositionOfChar(i) / getEndPositionOfChar(i) for each character,
but then it assigns each character bounding entry a shared y and height based on the overall text bbox (this.#textbb.y and this.#textbb.height).
That “one bbox Y/height for all characters” is a classic single-line shortcut and is the first major obstacle for multiline caret/selection rendering.

A second coupling is that textActions currently works with this.#curtext.textContent (the flattened text content).
 Once you represent multiline with <tspan> children, textContent can still provide a flattened string, but you must then reconcile:

how line breaks are represented (newlines vs separate tspans),
how “addressable characters” map to DOM indices and selection positions, especially for surrogate pairs and collapsed whitespace. The SVG 2 spec indicates addressable characters are indexed in UTF‑16 code units.
Text input element dependency
A maintainer discussion indicates that when using SvgCanvas without the full editor, text mode requires passing in an (invisible) <input id="text" ...> and calling canvas.textActions.setInputElem(...).
 This matters for multiline because <input> is inherently single-line; multiline editing typically uses <textarea> (or a contenteditable element). Any “native” multiline editing effort will likely need to change both the hidden input element type and the event listeners that synchronize it with the SVG <text> element.

Serialization/export and element allowance
At the svgcanvas level, the visible element allowlist contains both text and tspan (and also foreignObject).
 This indicates multiline via <tspan> is structurally compatible with internal element filtering. Export/serialization specifics are not fully inspected here (unspecified), but svgcanvas/draw imports a toXml helper (implying DOM-to-XML serialization is part of the pipeline).
 A practical integration strategy is therefore: make multiline text “real SVG DOM” (i.e., actual <tspan> children) so existing serialization naturally includes it.

Prior art and roadmap signal
A long-standing enhancement request for multiline text exists (#190) and references a historical “textedit branch” that was abandoned.
 This is a useful signal: multiline has been desired for years, but prior implementation attempts likely failed due to the caret/selection complexity described above.

pretext capabilities, APIs, and constraints relevant to multiline SVG text
What pretext provides (high signal)
pretext is explicitly designed to avoid DOM measurement/reflow and instead uses canvas-based measurement with the browser’s font engine as “ground truth.”
 Its public API has two relevant tiers:

Tier 1 (height/lineCount only):

prepare(text, font, options?) → PreparedText
layout(prepared, maxWidth, lineHeight) → {height, lineCount}

This tier is insufficient by itself for SVG export because it does not expose line strings.
Tier 2 (manual line layout):

prepareWithSegments(text, font, options?) → PreparedTextWithSegments
layoutWithLines(prepared, maxWidth, lineHeight) → {height, lineCount, lines} where each LayoutLine includes at least text and width

This tier is the direct match for generating <tspan> children.
It also provides walkLineRanges(...) and layoutNextLine(...) for more advanced layout patterns (e.g., varying line widths per line, “shrink-wrap” computations).
 For SVG-Edit, these can power features like “auto-fit text box width to the longest line.”

Whitespace and hard line breaks
pretext explicitly supports textarea-like behavior (preserving ordinary spaces, tabs, and hard breaks) via { whiteSpace: 'pre-wrap' } passed to prepare()/prepareWithSegments().
 This aligns with SVG 2’s definition that multiline preformatted text can be created using CSS white-space: pre or pre-line, where line-feed/carriage returns are preserved as forced line breaks and line boxes stack per CSS rules.

However, SVG 2 also documents that legacy xml:space="preserve" does not preserve newlines as line breaks; it converts newlines/tabs into spaces and preserves multiple spaces.
 The practical implication for export is:

For reliable multiline SVG, do not rely on newline characters in a single text node.
Instead, represent each line as a <tspan> and (optionally) use xml:space="preserve" to preserve leading/trailing/multiple spaces within each line.
Measurement runtime dependencies
Internally, pretext obtains a measurement canvas context by preferring OffscreenCanvas and falling back to a DOM <canvas> context; if neither is available, it throws.
 This has two SVG-Edit implications:

Runtime: fine in modern browsers (SVG-Edit’s stated supported set includes recent Chrome/Firefox/Safari).
Unit testing: SVG-Edit’s unit tests run in jsdom (Vitest/Vite config), where canvas APIs may be missing unless polyfilled; therefore tests that call pretext may need a browser-based test harness (Playwright) or a canvas polyfill strategy.
Performance and cache behavior
pretext emphasizes that prepare() is the expensive “one-time” pass (normalize whitespace + segmentation + glue rules + canvas measurement), while layout() is an inexpensive arithmetic hot path over cached widths.
 The repository includes benchmark numbers in its README snapshot (e.g., prepare() ~19ms and layout() ~0.09ms for a shared 500-text batch).

For SVG-Edit, the main performance consideration is that editing changes the text each keystroke, so you cannot amortize prepare() across many layouts in the same way you would for window resizes—unless you only reflow on commit/throttle. A good compromise is:

reflow (prepareWithSegments + layoutWithLines) on “pause” or on commit,
or reflow on each input event but throttle to ~30–60Hz, depending on typical text sizes.
pretext exposes clearCache() and setLocale() (which also clears caches).
 SVG-Edit can call clearCache() on document close or after large font churn to cap memory usage (conditional; actual cache growth patterns depend on use).

Locale and internationalization hooks
pretext exposes setLocale(locale?) to set locale for future prepares.
 Internally it also uses Intl.Segmenter for word segmentation and can be configured via a locale setter.
 The SVG 2 spec highlights that SVG text supports international needs including bidirectional text and complex shaping.

Important nuance: SVG’s rendering engine will still handle shaping/bidi when actually painting glyphs, but line breaking and wrapping decisions must be consistent with that rendering. pretext’s approach (measure segments with canvas in the same browser) is aligned with that goal, but correctness must be validated with RTL and mixed-script strings (see test matrix).

License compatibility
pretext declares MIT licensing.
 SVG-Edit is MIT licensed as well (repository README and license file listing).
 This is favorable for direct dependency integration, assuming any transitive dependencies remain compatible (pretext appears to have no runtime npm deps listed in its package.json; dev deps exist for build/test).

Integration approaches and required SVG-Edit code changes
Overview of SVG output strategy (common to all approaches)
Regardless of editing UX, the most interoperable SVG output is:

<text ...> as the parent text content element (SVG 2 defines text as the text content block element).
One <tspan> per line with explicit positioning:
either x + dy increments for line stacking,
or absolute x + y per line.
Use a consistent lineHeight (SVG 2 defines how line-height determines leading for multiline text).
This avoids reliance on SVG 2 inline-size support (which the spec itself notes can be inconsistently implemented, especially for RTL wrapping).

Approach comparison table
Dimension	Approach A: Dialog/side-panel multiline editor (commit-to-SVG)	Approach B: In-canvas HTML <textarea> overlay (WYSIWYG-ish)
Primary goal	Fast path to multiline authoring + correct SVG export	High-quality editing UX with multiline selection, IME, copy/paste
Reuse of existing textActions caret rendering	Minimal (can disable for multiline)
Partial (can bypass SVG caret/selection and rely on HTML overlay)
Complexity	Medium	High (coordinate transforms, overlay lifecycle, focus management)
Export correctness	High (explicit tspans)
High (same output)
Cross-browser risk	Lower (less reliance on text geometry APIs for caret)	Higher (overlay alignment under transforms/zoom/rotation)
Runtime size	Small (pretext dependency only)
Small–medium (pretext + overlay helpers)
Maintainability	Better (clear separation UI ↔ layout ↔ DOM)	More moving parts; harder to keep bugs low in transforms

Approach A: Multiline editing via dialog/side panel, render as <tspan> on commit
Concept: Keep the canvas rendering model simple: on the canvas, multiline text is just <text> with <tspan> lines. When the user edits, open a multiline UI (dialog/panel) with a <textarea>. On commit, run pretext and replace the <text> children with tspans. This avoids having to generalize SVG-Edit’s current caret/selection renderer to multiline.

Key integration points and files (primary):

packages/svgcanvas/core/event.js: currently finalizes a new text element and calls svgCanvas.textActions.start(element) on mouse up in text mode; this should be modified so multiline text creation routes into your dialog/panel editing entry point instead of the single-line in-canvas editor.
packages/svgcanvas/core/text-actions.js: leave in place for legacy single-line editing; add a branch to detect “multiline-enabled text elements” and skip (or use only for selection/move).
src/editor/... (UI layer): add a multiline text dialog/panel with a <textarea> and wrap-width/line-height fields (exact file locations unspecified; SVG-Edit has dialogs/panels loaded as strings via Vite plugin config).
Dependency management / build steps:

Add @chenglou/pretext to the relevant package (likely root, or svgcanvas workspace) and import it in your new helper module.
SVG-Edit v7 builds with Vite/Rollup; importing an ESM package with "type": "module" is compatible with this toolchain.
Detailed implementation steps (code-level):

Introduce a multiline text “model” on the SVG element

On <text>, store:
the raw author string (including \n) in editor-private metadata (e.g., data-svgedit-raw, or a <desc> child, or a namespaced attribute).
wrap width (in user units) and line height.
Unspecified: which attributes survive SVG-Edit sanitization/import/export pipelines; choose a storage mechanism consistent with svgcanvas sanitize/serialization (not fully inspected here).
Add a layout/render helper using pretext tier 2

Use: prepareWithSegments(rawText, font, { whiteSpace: 'pre-wrap' }) and layoutWithLines(prepared, maxWidth, lineHeight) to obtain line strings.
Render lines to SVG via <tspan> children

Clear existing children of <text>.
Append one <tspan> per line, setting:
x to the text’s anchor x (or a computed x for alignment),
dy to 0 for first line, and lineHeight for subsequent lines.
Keep styling on <text> (fill/stroke/font) so it inherits to tspans. The svgcanvas allowlist already includes tspan, reducing risk of internal removal.
Modify creation flow

In event.js, when creating new text:
If user is in “multiline text tool” (new tool mode) or sets a wrap width, create a <text> with metadata and immediately open the multiline editor UI.
Do not call textActions.start(element) for multiline elements.
Undo/redo integration

When committing the dialog, treat it as an undoable change:
changes include raw metadata + the <tspan> subtree.
Unspecified: the preferred command abstraction for subtree changes in current svgcanvas undo manager (not fully inspected here). Minimal approach: serialize “before” and “after” XML for the <text> element and replace on undo/redo.
Mermaid: Approach A data flow

User selects multiline text tool

User draws/places text anchor + sets wrap width

Create SVG

Open editor UI: textarea + wrap/lineHeight controls

On commit: pretext.prepareWithSegments + layoutWithLines

Replace

Undo/redo records change

Export: serialized SVG contains



Show code
Approach B: Inline editing using an HTML <textarea> overlay, continuously rendered into <tspan>
Concept: Replace SVG-Edit’s single-line caret renderer with a standard HTML multiline editor overlay positioned on top of the SVG canvas. As the user types, pretext computes line breaks (based on wrap width) and updates the underlying SVG <text>/<tspan> nodes, so the canvas shows WYSIWYG rendering while the overlay provides selection, IME composition, and clipboard support. This reduces reliance on per-character SVG geometry APIs.

Key integration points and files (primary):

packages/svgcanvas/core/text-actions.js: currently operates on a hidden <input> and draws an SVG caret/selection; you would:
replace/augment setInputElem() to accept a <textarea> (or create one internally),
add overlay creation + lifecycle,
bypass #chardata and SVG caret drawing for multiline mode.
packages/svgcanvas/core/event.js: keep the current call svgCanvas.textActions.start(element) but update TextActions.start() / toEditMode() to create/show the overlay editor for multiline.
Transform/zoom awareness: text-actions.js already computes an accumulated transform matrix for cursor placement in transformed groups. That same matrix (or its inverse) can be used to position the overlay.
Detailed implementation steps (code-level):

Introduce an overlay editor element

Create a positioned <textarea> in the editor container (not inside SVG).
Maintain mapping between SVG user coordinates and screen coordinates:
use svgcanvas root CTM and zoom (as event.js and text-actions already do for selection/cursor), then apply CSS transforms to the textarea.
Two-phase rendering loop

Overlay is source of truth during editing: textarea value = raw text.
On input events (throttled), compute new layout:
prepareWithSegments(value, font, { whiteSpace: 'pre-wrap' })
layoutWithLines(prepared, wrapWidth, lineHeight)
Update the SVG <text> element’s tspans accordingly.
Commit semantics

On blur/enter/escape, hide overlay and finalize tspans.
Push a single undo command representing the edit session.
Selection/clipboard

Use native textarea selection and clipboard; stop drawing the SVG selection path/caret for multiline.
This substantially reduces the complexity that otherwise arises from multiline per-character geometry differences across browsers.
Mermaid: Approach B data flow

Double-click text / create text

Enter textedit

Show HTML textarea overlay aligned to SVG text box

User types: textarea value changes

Throttle -> pretext.prepareWithSegments

pretext.layoutWithLines -> line strings

Update SVG

Exit edit: hide textarea, push undo command

Export: serialized SVG contains



Show code
Repo file pointers (for implementers)
The following repo files are the primary modification points for the approaches above (line anchors are unspecified here; use file search within the pages):

text
Copy
SVG-Edit/svgedit
- packages/svgcanvas/core/event.js
  https://github.com/SVG-Edit/svgedit/blob/master/packages/svgcanvas/core/event.js

- packages/svgcanvas/core/text-actions.js
  https://github.com/SVG-Edit/svgedit/blob/master/packages/svgcanvas/core/text-actions.js

- packages/svgcanvas/svgcanvas.js
  https://github.com/SVG-Edit/svgedit/blob/master/packages/svgcanvas/svgcanvas.js

- vite.config.mjs (build/test environment signals)
  https://github.com/SVG-Edit/svgedit/blob/master/vite.config.mjs

chenglou/pretext
- README (API signatures + examples)
  https://github.com/chenglou/pretext

- src/analysis.ts (locale/segmentation/whitespace handling)
  https://github.com/chenglou/pretext/blob/main/src/analysis.ts

- src/measurement.ts (canvas measurement + OffscreenCanvas fallback)
  https://github.com/chenglou/pretext/blob/main/src/measurement.ts
SVG correctness considerations for multiline output
Prefer explicit <tspan> layout over inline-size for compatibility
SVG 2 defines inline-size (applies to <text>) and provides examples of wrapping horizontal and RTL text with it.
 But the spec itself notes that “some browser may not render” the RTL inline-size example correctly and references a Chrome bug.
 If SVG-Edit’s primary goal is “rendering to SVG” robustly across browsers and downstream SVG consumers, explicit tspans are more dependable.

Handling forced line breaks and whitespace
SVG 2 defines multiline pre-formatted text creation via the CSS white-space property values pre and pre-line, where line-feed/carriage return becomes a forced line break and line boxes stack using CSS rules.

Separately, SVG 2 describes legacy xml:space behavior:

xml:space="default" removes newline characters and collapses runs of spaces (after trimming).
xml:space="preserve" converts newlines/tabs to spaces and preserves leading/trailing/multiple spaces.
Practical export rule: represent line breaks structurally (tspans), not as newline characters in a text node; use xml:space="preserve" only to preserve intra-line spacing.

Line height and baseline stacking
SVG 2 states it uses the line-height property to determine leading added between lines in multiline text and that it is not applicable to text on a path.
 This implies:

Multiline text-on-path should likely be unsupported or constrained in SVG-Edit’s first iteration (conditional feature).
Your multiline text box should define a clear lineHeight (SVG-Edit UI should expose it or derive it from font-size).
Internationalization, RTL, and “addressable character” indexing
SVG 2 explicitly acknowledges bidirectional and complex text layout needs.
 It also defines that “addressable characters” for DOM text methods are indexed in UTF‑16 code units.

pretext claims broad language support including emojis and mixed-bidi.
 The key risk is not glyph shaping (handled by the browser when drawing SVG text) but line breaking decisions and caret indexing for editing. This must be validated with:

RTL strings (Arabic/Hebrew),
mixed-direction strings,
emoji sequences and surrogate pairs (since both textarea selection APIs and SVG DOM “addressable characters” are UTF‑16 based).
Implementation plan, milestones, and testing strategy
Milestones with effort estimates
Milestone	Deliverable	Effort
Architecture decision	Choose Approach A vs B (or A then B); define multiline text element “contract” (metadata fields; wrap width; lineHeight; alignment rules)	Low
Add pretext dependency	Add @chenglou/pretext import path; confirm Vite bundling; add minimal smoke test page	Low
Multiline renderer helper	Implement layoutToTspans(textEl, rawText, font, maxWidth, lineHeight) using prepareWithSegments + layoutWithLines	Medium
UI for multiline authoring	Add <textarea>-based editor UI (dialog/panel) + controls for wrap width & lineHeight (Approach A)	Medium
Wire creation/edit flow	Modify event.js “text” mode mouseUp routing: open multiline editor for multiline elements; keep legacy textActions for single-line	Medium
Undo/redo correctness	Ensure a multiline edit is one undo step; ensure copy/paste duplicates metadata + tspans	High
Internationalization & RTL validation	Add locale selection or infer from editor locale; test RTL wrapping and mixed scripts; ensure no corruption on export/import	Medium–High
Optional upgrade: overlay editor	Implement Approach B overlay for in-canvas editing; ensure transforms/zoom accuracy	High

SVG-Edit’s toolchain already supports unit testing with Vitest in jsdom and has Playwright configuration files present (suggesting a path to browser-based tests).
 pretext requires a canvas context, so browser tests (Playwright) are likely required for meaningful layout assertions.

Testing checklist
Core functional tests

Creating a multiline text box: resulting SVG contains a <text> element with N <tspan> children for N lines.
Editing: newline insertion creates new tspans; deletion merges lines; empty line handling is correct (see pitfalls).
Wrap width change triggers full reflow (tspan text changes; line count changes).
Undo/redo returns both raw text metadata and <tspan> set to previous state (undo mechanism details unspecified).
Cross-feature compatibility tests

Move/scale/rotate groups containing multiline text: ensure tspans remain aligned with parent transforms and editing still works.
Style changes (fill/stroke/font-size/font-family) apply consistently to all lines via inheritance on <text>.
Copy/paste duplicates the entire <text> subtree including tspans (and metadata).
Text-layout correctness tests

Leading/trailing/multiple spaces on lines: preserved when xml:space="preserve" is set.
Tabs: preserved in authoring; exported as spaces or preserved per policy (define explicitly; SVG 2 xml:space converts tabs to spaces).
Mixed scripts + emoji: no crashes; stable layout.
Short QA/test matrix
Area	Cases
Browsers	Latest stable Chromium-based browser, Firefox, Safari (SVG-Edit’s supported set)
Wrap behavior	Very narrow width; very wide width; resizing wrap width repeatedly; “shrink-wrap” width computed from walkLineRanges (optional)
Whitespace	Multiple spaces, leading spaces, trailing spaces, tabs, blank lines
Scripts	Latin; CJK; Arabic (RTL); mixed bidi; combining marks; emoji ZWJ sequences
Accessibility	Ensure text remains real SVG text (not only foreignObject); ensure labels can be referenced with aria-labelledby as recommended in SVG text accessibility guidance

Example code snippets
Using pretext to generate line strings and render to <text>/<tspan>
This example uses the Tier 2 API (prepareWithSegments + layoutWithLines) because the Tier 1 layout() only returns height/lineCount.

js
Copy
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Render raw multiline text into SVG <text> with <tspan> per line.
 *
 * Assumptions:
 * - `maxWidth` and `lineHeight` are in the same coordinate units as your SVG user units
 *   (often px in typical browser SVG usage).
 * - `font` is a canvas-compatible font shorthand: e.g., "16px Inter" or "italic 600 16px Inter".
 *   (Per pretext README, it must match canvas `ctx.font` format.)
 */
export function applyPretextMultilineToTextElement ({
  svgDoc,
  textEl,
  rawText,
  font,
  maxWidth,
  lineHeight
}) {
  // Precompute segments + widths (expensive step).
  const prepared = prepareWithSegments(rawText, font, { whiteSpace: 'pre-wrap' })
  // Compute line breaks + per-line strings (cheap arithmetic over cached widths).
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight)

  // Preserve intra-line spacing (newlines are structural via tspans).
  textEl.setAttribute('xml:space', 'preserve')

  // Optional: store raw author text for re-editing (encoding strategy is up to you).
  // textEl.setAttribute('data-svgedit-raw', rawText)

  // Replace children with tspans.
  while (textEl.firstChild) textEl.removeChild(textEl.firstChild)

  // Use x from <text> as anchor.
  const x = textEl.getAttribute('x') ?? '0'

  lines.forEach((line, i) => {
    const tspan = svgDoc.createElementNS(SVG_NS, 'tspan')
    tspan.setAttribute('x', x)
    tspan.setAttribute('dy', i === 0 ? '0' : String(lineHeight))
    tspan.textContent = line.text
    textEl.appendChild(tspan)
  })
}
Why this is aligned with project/spec expectations:

pretext explicitly documents { whiteSpace: 'pre-wrap' } to preserve \t and \n in the authoring model.
SVG 2 documents multiline stacking and line-height behavior for multiline text.
SVG-Edit’s canvas layer recognizes <tspan> as a visible element type.
Integrating into SVG-Edit export/serialization
SVG-Edit’s export pipeline details are not fully inspected here (unspecified), but svgcanvas/draw imports toXml from utilities, suggesting DOM-based serialization.
 The most robust integration pattern is:

Ensure multiline text is materialized into real <tspan> children whenever it changes (not lazily at export time).
Let existing serialization export the DOM.
A minimal “export hook” (conceptual) could look like:

js
Copy
/**
 * Before exporting SVG, ensure all multiline <text> nodes are up-to-date.
 * This assumes you store raw text + wrap width/lineHeight on the element.
 *
 * NOTE: The actual place to hook this in SVG-Edit is unspecified (export code not inspected).
 */
export function hydrateAllMultilineText (svgRoot, svgDoc) {
  const textNodes = svgRoot.querySelectorAll('text[data-svgedit-multiline="true"]')
  for (const textEl of textNodes) {
    const rawText = textEl.getAttribute('data-svgedit-raw') ?? ''
    const maxWidth = Number(textEl.getAttribute('data-svgedit-wrap') ?? 0)
    const lineHeight = Number(textEl.getAttribute('data-svgedit-lineheight') ?? 0)

    // Derive font shorthand from SVG attributes (implementation-specific).
    const fontSize = textEl.getAttribute('font-size') ?? '16px'
    const fontFamily = textEl.getAttribute('font-family') ?? 'sans-serif'
    const font = `${fontSize} ${fontFamily}`

    applyPretextMultilineToTextElement({
      svgDoc,
      textEl,
      rawText,
      font,
      maxWidth,
      lineHeight
    })
  }
}
The key design point is that export/serialization should not need special-case logic if the SVG DOM already contains <tspan> lines; this reduces the chance of export bugs and keeps compatibility with existing svgcanvas element lists (text,tspan,...).

Pitfalls and mitigation strategies
Caret/selection rendering vs multiline geometry (SVG-Edit-specific)
Pitfall: Current text-actions.js models each character with a shared y/height from the full text bbox, which will not work for multiline.

Mitigation: Choose an editing approach that avoids SVG caret geometry for multiline (Approach A or overlay Approach B). If you must keep SVG caret rendering, you will need to compute per-character extents per line (high complexity; not fully designed here).

Whitespace semantics mismatch (SVG xml:space vs multiline)
Pitfall: xml:space="preserve" does not preserve newlines as line breaks; it converts newlines/tabs to spaces.

Mitigation: Do not depend on embedded newline characters for rendering; instead render separate tspans. Use xml:space="preserve" only to preserve multiple/leading/trailing spaces within each line.

Empty lines and “invisible tspans”
Pitfall: Some renderers can collapse empty tspans or make them hard to select/copy. (This behavior is not exhaustively sourced here; treat as a known interoperability risk—conditional.)
Mitigation: Represent empty lines with a non-breaking space (U+00A0) or a zero-width non-joiner pattern, while retaining raw text in editor metadata. Validate in the QA matrix across browsers.

Font fidelity and units
Pitfall: pretext requires a canvas font shorthand string that must match the CSS text style (size/weight/style/family). Its README warns to sync font with canvas ctx.font usage.

Mitigation: Implement a deterministic conversion from SVG attributes (font-size, font-family, optionally font-style/font-weight) to a canvas font shorthand. Treat unsupported SVG font properties as out-of-scope initially (explicitly unspecified) and iterate with tests.

RTL wrapping and spec-defined features (inline-size)
Pitfall: Depending on inline-size for wrapping delegates to browser SVG 2 text layout support; the SVG 2 spec itself notes browser interoperability issues for RTL wrapping examples and calls out a Chrome bug.

Mitigation: Use pretext to compute explicit line breaks and output tspans; rely on SVG renderer primarily for glyph shaping, not for wrapping logic. Test RTL and mixed-bidi extensively.

Testing environment mismatch (jsdom vs canvas requirements)
Pitfall: pretext needs OffscreenCanvas or a DOM canvas context and will throw otherwise.
 SVG-Edit’s unit tests run in jsdom per Vite/Vitest settings.

Mitigation: Move layout correctness tests into Playwright (real browser canvas), and keep jsdom unit tests for DOM structure and command history behavior.

Licensing and distribution
Pitfall: Any new dependency must be license-compatible and must not introduce incompatible transitive licensing.
Mitigation: pretext is MIT licensed and appears to have no runtime npm dependencies, which is favorable for inclusion with SVG-Edit’s MIT licensing posture.

Assumptions and unspecified details
Unspecified (not inspected): exact SVG-Edit editor UI files to modify for adding a multiline text dialog/panel and for wiring canvas events to UI actions; the report infers feasibility from the known editor/canvas separation and Vite HTML-string loading patterns.
Unspecified (not inspected): the precise export function entry point and undo command abstractions for subtree text edits in SVG-Edit v7; the report assumes DOM-to-XML serialization and an undo manager exist (supported indirectly by imports and undo module presence).
Assumption: SVG user units in typical SVG-Edit browser usage correspond closely enough to CSS px for lineHeight and maxWidth inputs into pretext; if SVG-Edit supports other unit systems, a conversion layer is required.
Assumption: Target environment is “modern browsers” as SVG-Edit states (recent Chrome/Firefox/Safari), which aligns with pretext’s reliance on modern platform APIs like Intl.Segmenter and (optionally) OffscreenCanvas.
