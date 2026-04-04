import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import { NS } from './namespaces.js'

const RAW_TEXT_ATTR = 'data-svgedit-raw-text'
const WRAP_WIDTH_ATTR = 'data-svgedit-wrap-width'
const WRAP_HEIGHT_ATTR = 'data-svgedit-wrap-height'
const LINE_HEIGHT_ATTR = 'data-svgedit-line-height'
const MULTILINE_ATTR = 'data-svgedit-multiline'
const OVERFLOW_ATTR = 'data-svgedit-text-overflow'
const EMPTY_LINE_ATTR = 'data-svgedit-empty-line'
const EMPTY_LINE_PLACEHOLDER = ' '

const toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildFontShorthand = (textElem) => {
  const computedStyle = window.getComputedStyle(textElem)
  const fontStyle = computedStyle.fontStyle || textElem.getAttribute('font-style') || 'normal'
  const fontWeight = computedStyle.fontWeight || textElem.getAttribute('font-weight') || 'normal'
  const fontSize = computedStyle.fontSize || `${textElem.getAttribute('font-size') || 16}px`
  const fontFamily = computedStyle.fontFamily || textElem.getAttribute('font-family') || 'sans-serif'
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

const getLineHeight = (textElem) => {
  const fontSize = toNumber(textElem.getAttribute('font-size'), 16)
  return toNumber(textElem.getAttribute(LINE_HEIGHT_ATTR), fontSize * 1.2)
}

const getWrapWidth = (textElem) => {
  const rawWrapWidth = toNumber(textElem.getAttribute(WRAP_WIDTH_ATTR), Number.NaN)
  if (Number.isFinite(rawWrapWidth) && rawWrapWidth > 0) {
    return rawWrapWidth
  }
  return 1000000
}

const clearTextChildren = (textElem) => {
  while (textElem.firstChild) {
    textElem.removeChild(textElem.firstChild)
  }
}

export const applyMultilineText = (textElem, rawText) => {
  const normalizedText = String(rawText ?? '')
  const hasHardBreaks = normalizedText.includes('\n') || normalizedText.includes('\r')
  const hasWrapWidth = Number.isFinite(toNumber(textElem.getAttribute(WRAP_WIDTH_ATTR), Number.NaN))
  const forceMultiline = textElem.getAttribute(MULTILINE_ATTR) === 'true'

  if (!hasHardBreaks && !hasWrapWidth && !forceMultiline) {
    clearTextChildren(textElem)
    textElem.textContent = normalizedText
    textElem.removeAttribute(RAW_TEXT_ATTR)
    return
  }

  const font = buildFontShorthand(textElem)
  const lineHeight = getLineHeight(textElem)
  const wrapWidth = getWrapWidth(textElem)
  const prepared = prepareWithSegments(normalizedText, font, { whiteSpace: 'pre-wrap' })
  const { lineCount, lines } = layoutWithLines(prepared, wrapWidth, lineHeight)
  const wrapHeight = toNumber(textElem.getAttribute(WRAP_HEIGHT_ATTR), Number.NaN)
  let renderedLines = lines
  if (Number.isFinite(wrapHeight) && wrapHeight > 0 && lineHeight > 0) {
    const maxLines = Math.max(1, Math.floor(wrapHeight / lineHeight))
    if (lines.length > maxLines) {
      renderedLines = lines.slice(0, maxLines)
    }
  }

  clearTextChildren(textElem)
  const x = textElem.getAttribute('x') || '0'
  const y = toNumber(textElem.getAttribute('y'), getLineHeight(textElem))

  renderedLines.forEach((line, index) => {
    const tspan = document.createElementNS(NS.SVG, 'tspan')
    tspan.setAttribute('x', x)
    tspan.setAttribute('y', String(y + index * lineHeight))
    if (line.text === '') {
      tspan.setAttribute(EMPTY_LINE_ATTR, 'true')
      tspan.setAttribute('xml:space', 'preserve')
      tspan.setAttribute('textLength', '0')
      tspan.setAttribute('lengthAdjust', 'spacingAndGlyphs')
      tspan.textContent = EMPTY_LINE_PLACEHOLDER
    } else {
      tspan.removeAttribute(EMPTY_LINE_ATTR)
      tspan.removeAttribute('textLength')
      tspan.removeAttribute('lengthAdjust')
      tspan.textContent = line.text
    }
    textElem.append(tspan)
  })

  textElem.setAttribute(RAW_TEXT_ATTR, normalizedText)
  if (Number.isFinite(wrapHeight) && wrapHeight > 0) {
    const estimatedHeight = Math.max(lineCount, 1) * lineHeight
    textElem.setAttribute(OVERFLOW_ATTR, estimatedHeight > wrapHeight ? 'true' : 'false')
  } else {
    textElem.removeAttribute(OVERFLOW_ATTR)
  }
  if (forceMultiline || hasHardBreaks || hasWrapWidth) {
    textElem.setAttribute(MULTILINE_ATTR, 'true')
  }
}

export const getRawMultilineText = (textElem) => {
  return textElem.getAttribute(RAW_TEXT_ATTR) ?? textElem.textContent ?? ''
}

export const isMultilineTextElement = (textElem) => {
  if (!textElem) {
    return false
  }
  const raw = textElem.getAttribute(RAW_TEXT_ATTR)
  const hasWrapWidth = Number.isFinite(toNumber(textElem.getAttribute(WRAP_WIDTH_ATTR), Number.NaN))
  const forceMultiline = textElem.getAttribute(MULTILINE_ATTR) === 'true'
  return forceMultiline || Boolean(raw && (raw.includes('\n') || raw.includes('\r'))) || hasWrapWidth
}

export const enableMultilineTextElement = (textElem) => {
  if (!textElem) {
    return
  }
  textElem.setAttribute(MULTILINE_ATTR, 'true')
  if (!textElem.hasAttribute(RAW_TEXT_ATTR)) {
    textElem.setAttribute(RAW_TEXT_ATTR, textElem.textContent || '')
  }
}

export const getMultilineFrameRect = (textElem) => {
  if (!textElem) {
    return null
  }
  const frameRef = textElem.getAttribute('data-svgedit-shape-inside-ref')
  if (!frameRef || !frameRef.startsWith('#')) {
    return null
  }
  return document.getElementById(frameRef.slice(1))
}

export const syncMultilineFrameRect = (textElem) => {
  const frameRect = getMultilineFrameRect(textElem)
  if (!frameRect) {
    return null
  }

  const fontSize = toNumber(textElem.getAttribute('font-size'), 16)
  const x = toNumber(textElem.getAttribute('x'), 0)
  const y = toNumber(textElem.getAttribute('y'), fontSize) - fontSize
  const width = Math.max(1, toNumber(textElem.getAttribute(WRAP_WIDTH_ATTR), 1))
  const height = Math.max(1, toNumber(textElem.getAttribute(WRAP_HEIGHT_ATTR), 1))

  frameRect.setAttribute('x', String(x))
  frameRect.setAttribute('y', String(y))
  frameRect.setAttribute('width', String(width))
  frameRect.setAttribute('height', String(height))
  return frameRect
}
