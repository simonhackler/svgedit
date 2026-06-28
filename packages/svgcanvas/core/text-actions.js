/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { transformPoint, matrixMultiply, getTransformList, transformListToTransform } from './math.js'
import { assignAttributes, getElement } from './utilities.js'
import {
  applyMultilineText,
  enableMultilineTextElement,
  getTextFontSize,
  getTextLineHeight,
  getRawMultilineText
} from './multiline-text.js'

let svgCanvas = null
const TEXT_ALIGN_STYLE_REGEX = /(?:^|;)\s*text-align\s*:\s*([^;]+)/i

const normalizeTextAlign = (value) => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'left' || normalized === 'start') {
    return 'left'
  }
  if (normalized === 'center' || normalized === 'middle') {
    return 'center'
  }
  if (normalized === 'right' || normalized === 'end') {
    return 'right'
  }
  return null
}

/**
 * @function module:text-actions.init
 * @param {module:text-actions.svgCanvas} textActionsContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
}

/**
 * Group: Text edit functions
 * Functions relating to editing text elements.
 * @class TextActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
class TextActions {
  #curtext = null
  #multilineInput = null
  #textinput = null
  #cursor = null
  #blinker = null
  #matrix = null

  #promoteCurrentTextToMultiline = () => {
    if (this.#curtext?.tagName === 'text') {
      enableMultilineTextElement(this.#curtext)
    }
  }

  #getNumericAttr = (name, fallback) => {
    const parsed = Number.parseFloat(this.#curtext?.getAttribute(name) ?? '')
    return Number.isFinite(parsed) ? parsed : fallback
  }

  #getCurrentFontSize = () => getTextFontSize(this.#curtext)

  #getCurrentLineHeight = () => getTextLineHeight(this.#curtext)

  #setActiveInput = () => {
    this.#textinput = this.#multilineInput
  }

  #ptToViewport = (x, y) => {
    const svgContent = svgCanvas.getSvgContent()
    const rootGroup = svgContent?.querySelector('g')
    const screenCTM = rootGroup?.getScreenCTM?.()
    if (!screenCTM) {
      const fallbackPoint = this.#ptToScreen(x, y)
      return {
        x: fallbackPoint.x,
        y: fallbackPoint.y
      }
    }

    let point = { x, y }
    if (this.#matrix) {
      point = transformPoint(point.x, point.y, this.#matrix)
    }

    return transformPoint(point.x, point.y, screenCTM)
  }

  #hideMultilineInput = () => {
    if (!this.#multilineInput) {
      return
    }

    Object.assign(this.#multilineInput.style, {
      display: 'none',
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      left: '-10000px',
      top: '-10000px',
      width: '1px',
      height: '1px',
      color: '',
      WebkitTextFillColor: '',
      caretColor: ''
    })
  }

  #getStoredMultilineTextAlignment = () => {
    const styleMatch = this.#curtext?.getAttribute('style')?.match(TEXT_ALIGN_STYLE_REGEX)
    return normalizeTextAlign(styleMatch?.[1]) ??
      normalizeTextAlign(this.#curtext?.getAttribute('text-align'))
  }

  #inferRenderedMultilineTextAlignment = () => {
    const wrapWidth = Number.parseFloat(this.#curtext?.getAttribute('data-svgedit-wrap-width') ?? '')
    const baseX = Number.parseFloat(this.#curtext?.getAttribute('x') ?? '')
    if (!Number.isFinite(wrapWidth) || wrapWidth <= 0 || !Number.isFinite(baseX)) {
      return null
    }

    const lines = Array.from(this.#curtext.querySelectorAll('tspan'))
    for (const line of lines) {
      const lineX = Number.parseFloat(line.getAttribute('x') ?? '')
      if (!Number.isFinite(lineX)) {
        continue
      }

      const offset = lineX - baseX
      if (offset <= 1) {
        return 'left'
      }

      const lineWidth = line.getComputedTextLength?.() ?? 0
      const availableOffset = Math.max(0, wrapWidth - lineWidth)
      if (availableOffset <= 1) {
        return 'left'
      }

      return offset >= availableOffset * 0.75 ? 'right' : 'center'
    }

    return null
  }

  #getMultilineTextAlignment = (computedStyle) => {
    const storedAlign = this.#getStoredMultilineTextAlignment()
    if (storedAlign) {
      return storedAlign
    }

    const renderedAlign = this.#inferRenderedMultilineTextAlignment()
    if (renderedAlign) {
      return renderedAlign
    }

    const textAnchor = this.#curtext.getAttribute('text-anchor') || computedStyle.textAnchor || 'start'
    if (textAnchor === 'middle') {
      return 'center'
    }
    if (textAnchor === 'end') {
      return 'right'
    }
    return normalizeTextAlign(computedStyle.textAlign) ?? 'left'
  }

  #ensureCursor = () => {
    this.#cursor = getElement('text_cursor')
    if (!this.#cursor) {
      this.#cursor = document.createElementNS(NS.SVG, 'line')
      assignAttributes(this.#cursor, {
        id: 'text_cursor',
        stroke: '#333',
        'stroke-width': 1
      })
      getElement('selectorParentGroup').append(this.#cursor)
    }

    if (!this.#blinker) {
      this.#blinker = setInterval(() => {
        const show = this.#cursor.getAttribute('display') === 'none'
        this.#cursor.setAttribute('display', show ? 'inline' : 'none')
      }, 600)
    }
  }

  #setMultilineCursor = (index = undefined) => {
    if (!this.#curtext || !this.#textinput) {
      return
    }

    if (index === undefined) {
      index = this.#textinput.selectionEnd ?? this.#textinput.value.length
    }

    if (this.#textinput.selectionStart !== this.#textinput.selectionEnd) {
      if (this.#cursor) {
        this.#cursor.setAttribute('visibility', 'hidden')
      }
      return
    }

    this.#ensureCursor()

    const tspans = [...this.#curtext.querySelectorAll('tspan')]
    const renderedLines = (tspans.length ? tspans : [this.#curtext]).map((node) => {
      const isEmptyLine = node.getAttribute?.('data-svgedit-empty-line') === 'true'
      return {
        text: isEmptyLine ? '' : (node.textContent ?? ''),
        domLength: (node.textContent ?? '').length
      }
    })
    const rawText = this.#textinput.value || ''
    const mappings = []
    let rawIndex = 0
    let domIndex = 0

    renderedLines.forEach(({ text: lineText, domLength }, lineIndex) => {
      const rawStart = rawIndex
      const domStart = domIndex
      rawIndex += lineText.length
      domIndex += domLength

      let breakLength = 0
      if (rawText.slice(rawIndex, rawIndex + 2) === '\r\n') {
        breakLength = 2
      } else if (rawText[rawIndex] === '\n' || rawText[rawIndex] === '\r') {
        breakLength = 1
      }

      mappings.push({
        lineIndex,
        lineText,
        rawStart,
        rawEnd: rawIndex,
        domStart,
        domEnd: domStart + domLength,
        breakLength
      })

      rawIndex += breakLength
    })

    let targetLine = mappings.length - 1
    let column = mappings.at(-1)?.lineText.length ?? 0

    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i]
      const breakEnd = mapping.rawEnd + mapping.breakLength

      if (index < mapping.rawEnd || (index === mapping.rawEnd && mapping.breakLength === 0)) {
        targetLine = i
        column = Math.max(0, Math.min(index - mapping.rawStart, mapping.lineText.length))
        break
      }

      if (mapping.breakLength > 0 && index <= breakEnd) {
        targetLine = Math.min(i + 1, mappings.length - 1)
        column = 0
        break
      }
    }

    const lineText = mappings[targetLine]?.lineText ?? ''
    const frameX = this.#getNumericAttr('x', 0)
    const fontSize = this.#getCurrentFontSize()
    const frameY = this.#getNumericAttr('y', fontSize) - fontSize
    const lineHeight = this.#getCurrentLineHeight()
    const domIndexForCursor = (mappings[targetLine]?.domStart ?? 0) + column

    let caretX = frameX
    if (lineText.length > 0) {
      if (column <= 0) {
        caretX = this.#curtext.getStartPositionOfChar(domIndexForCursor).x
      } else if (column >= lineText.length) {
        caretX = this.#curtext.getEndPositionOfChar(domIndexForCursor - 1).x
      } else {
        caretX = this.#curtext.getStartPositionOfChar(domIndexForCursor).x
      }
    }

    const lineTop = frameY + targetLine * lineHeight
    const startPt = this.#ptToScreen(caretX, lineTop)
    const endPt = this.#ptToScreen(caretX, lineTop + lineHeight)

    assignAttributes(this.#cursor, {
      x1: startPt.x,
      y1: startPt.y,
      x2: endPt.x,
      y2: endPt.y,
      visibility: 'visible',
      display: 'inline'
    })
  }

  #syncMultilineInput = () => {
    if (!this.#curtext || !this.#textinput) {
      return
    }

    const fontSize = this.#getCurrentFontSize()
    const lineHeight = this.#getCurrentLineHeight()
    const frameX = this.#getNumericAttr('x', 0)
    const frameY = this.#getNumericAttr('y', fontSize) - fontSize
    const frameWidth = Math.max(this.#getNumericAttr('data-svgedit-wrap-width', 1), 1)
    const frameHeight = Math.max(this.#getNumericAttr('data-svgedit-wrap-height', 1), 1)

    const topLeft = this.#ptToViewport(frameX, frameY)
    const topRight = this.#ptToViewport(frameX + frameWidth, frameY)
    const bottomLeft = this.#ptToViewport(frameX, frameY + frameHeight)
    const fontBottom = this.#ptToViewport(frameX, frameY + fontSize)
    const lineBottom = this.#ptToViewport(frameX, frameY + lineHeight)
    const computedStyle = window.getComputedStyle(this.#curtext)
    const fontSizePx = Math.max(Math.hypot(fontBottom.x - topLeft.x, fontBottom.y - topLeft.y), 1)
    const lineHeightPx = Math.max(Math.hypot(lineBottom.x - topLeft.x, lineBottom.y - topLeft.y), 1)

    Object.assign(this.#textinput.style, {
      position: 'fixed',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
      left: `${topLeft.x}px`,
      top: `${topLeft.y}px`,
      width: `${Math.max(topRight.x - topLeft.x, 1)}px`,
      height: `${Math.max(bottomLeft.y - topLeft.y, 1)}px`,
      fontFamily: computedStyle.fontFamily || this.#curtext.getAttribute('font-family') || 'sans-serif',
      fontSize: `${fontSizePx}px`,
      fontStyle: computedStyle.fontStyle || this.#curtext.getAttribute('font-style') || 'normal',
      fontWeight: computedStyle.fontWeight || this.#curtext.getAttribute('font-weight') || 'normal',
      lineHeight: `${lineHeightPx}px`,
      letterSpacing: computedStyle.letterSpacing,
      wordSpacing: computedStyle.wordSpacing,
      direction: computedStyle.direction || 'ltr',
      textAlign: this.#getMultilineTextAlignment(computedStyle),
      textAlignLast: this.#getMultilineTextAlignment(computedStyle),
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      caretColor: 'transparent'
    })
  }

  /**
   * Get the accumulated transformation matrix from the element up to the SVG content element.
   * This includes transforms from all parent groups, fixing the issue where text cursor
   * appears in the wrong position when editing text inside a transformed group.
   * @param {Element} elem - The element to get the accumulated matrix for
   * @returns {SVGMatrix|null} The accumulated transformation matrix, or null if none
   * @private
   */
  #getAccumulatedMatrix = (elem) => {
    const svgContent = svgCanvas.getSvgContent()
    const matrices = []

    let current = elem
    while (current && current !== svgContent && current.nodeType === 1) {
      const tlist = getTransformList(current)
      if (tlist && tlist.numberOfItems > 0) {
        const matrix = transformListToTransform(tlist).matrix
        matrices.unshift(matrix) // Add to beginning to maintain correct order
      }
      current = current.parentNode
    }

    if (matrices.length === 0) {
      return null
    }

    if (matrices.length === 1) {
      return matrices[0]
    }

    // Multiply all matrices together
    return matrixMultiply(...matrices)
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #ptToScreen = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }

  /**
   * @param {Element} target
   * @returns {void}
   */
  select (target) {
    this.#curtext = target
    this.#promoteCurrentTextToMultiline()
    svgCanvas.selectOnly?.([target])
    svgCanvas.textActions.toEditMode()
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  start (elem) {
    this.#curtext = elem
    this.#promoteCurrentTextToMultiline()
    svgCanvas.textActions.toEditMode()
  }

  /**
   * @returns {void}
   */
  mouseDown () {
    this.#textinput?.focus()
  }

  /**
   * @returns {void}
   */
  mouseMove () {}

  /**
   * @param {external:MouseEvent} evt
   * @returns {void}
   */
  mouseUp (evt) {
    if (evt.target !== this.#curtext) {
      svgCanvas.textActions.toSelectMode(true)
    }
  }

  /**
   * @param {Integer} index
   * @returns {void}
   */
  setCursor (index) {
    this.#setMultilineCursor(index)
  }

  /**
   * @returns {void}
   */
  toEditMode () {
    svgCanvas.setCurrentMode('textedit')
    svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    // Make selector group accept clicks
    /* const selector = */ svgCanvas.selectorManager.requestSelector(this.#curtext) // Do we need this? Has side effect of setting lock, so keeping for now, but next line wasn't being used
    // const sel = selector.selectorRect;

    svgCanvas.textActions.init()

    this.#curtext.style.cursor = 'text'
    if (!this.#textinput) {
      return
    }

    this.#syncMultilineInput()
    this.#textinput.focus()
    const index = this.#textinput.value.length
    this.#textinput.setSelectionRange(index, index)
    this.#setMultilineCursor(index)
  }

  /**
   * @param {boolean|Element} selectElem
   * @fires module:svgcanvas.SvgCanvas#event:selected
   * @returns {void}
   */
  toSelectMode (selectElem) {
    svgCanvas.setCurrentMode('select')
    clearInterval(this.#blinker)
    this.#blinker = null
    if (this.#cursor) {
      this.#cursor.setAttribute('visibility', 'hidden')
    }
    this.#hideMultilineInput()

    if (!this.#curtext) {
      return
    }
    const curtext = this.#curtext

    curtext.style.cursor = 'move'

    if (selectElem) {
      svgCanvas.clearSelection()
      curtext.style.cursor = 'move'

      svgCanvas.call('selected', [curtext])
      svgCanvas.addToSelection([curtext], true)
    }
    const committedText = this.#textinput?.value ?? getRawMultilineText(curtext)
    applyMultilineText(curtext, committedText)

    if (!curtext.textContent.length) {
      // No content, so delete
      svgCanvas.deleteSelectedElements()
    }

    this.#textinput?.blur()
    this.#curtext = null
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  setMultilineInputElem (elem) {
    this.#multilineInput = elem
    this.#textinput = elem
  }

  /**
   * @returns {void}
   */
  clear () {
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.toSelectMode()
    }
  }

  /**
   * @returns {Element|null}
   */
  getCurrentTextElement () {
    return this.#curtext || null
  }

  /**
   * @returns {void}
   */
  init () {
    if (!this.#curtext) {
      return
    }

    if (!this.#curtext.parentNode) {
      // Result of the ffClone, need to get correct element
      const selectedElements = svgCanvas.getSelectedElements()
      this.#curtext = selectedElements[0]
      svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    }

    // Calculate accumulated transform matrix including all parent groups
    // This fixes the issue where text cursor appears in wrong position
    // when editing text inside a group with transforms
    this.#matrix = this.#getAccumulatedMatrix(this.#curtext)

    this.#setActiveInput()
    if (!this.#textinput) {
      return
    }
    this.#textinput.value = getRawMultilineText(this.#curtext)
    this.#syncMultilineInput()
    this.#setMultilineCursor()
  }
}

// Export singleton instance for backward compatibility
export const textActionsMethod = new TextActions()
