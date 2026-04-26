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
const DEFAULT_PROMOTED_FRAME_WIDTH = 240
const DEFAULT_PROMOTED_FRAME_HEIGHT = 120
const SHAPE_INSIDE_REF_REGEX = /shape-inside\s*:\s*url\((['"]?)(#[^)'" ;]+)\1\)/i
const FONT_SIZE_STYLE_REGEX = /font-size\s*:\s*([^;]+)/i
const LINE_HEIGHT_STYLE_REGEX = /line-height\s*:\s*([^;]+)/i

const toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseLength = (value, relativeTo = 1) => {
  if (typeof value !== 'string') {
    return Number.NaN
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'normal') {
    return Number.NaN
  }

  if (/^-?\d*\.?\d+$/.test(normalized)) {
    return Number.parseFloat(normalized) * relativeTo
  }
  if (normalized.endsWith('px')) {
    return Number.parseFloat(normalized)
  }
  if (normalized.endsWith('%')) {
    return Number.parseFloat(normalized) * relativeTo / 100
  }
  if (normalized.endsWith('em')) {
    return Number.parseFloat(normalized) * relativeTo
  }
  return Number.parseFloat(normalized)
}

const getStyleValue = (textElem, regex) => {
  const styleAttr = textElem.getAttribute('style') || ''
  const match = styleAttr.match(regex)
  return match?.[1]?.trim() || ''
}

export const getTextFontSize = (textElem) => {
  if (!textElem) {
    return 16
  }

  const attrSize = toNumber(textElem.getAttribute('font-size'), Number.NaN)
  if (Number.isFinite(attrSize) && attrSize > 0) {
    return attrSize
  }

  const computedSize = parseLength(window.getComputedStyle(textElem).fontSize)
  if (Number.isFinite(computedSize) && computedSize > 0) {
    return computedSize
  }

  const inlineSize = parseLength(getStyleValue(textElem, FONT_SIZE_STYLE_REGEX))
  if (Number.isFinite(inlineSize) && inlineSize > 0) {
    return inlineSize
  }

  return 16
}

export const getTextLineHeight = (textElem) => {
  const fontSize = getTextFontSize(textElem)
  const storedLineHeight = toNumber(textElem?.getAttribute(LINE_HEIGHT_ATTR), Number.NaN)
  if (Number.isFinite(storedLineHeight) && storedLineHeight > 0) {
    return storedLineHeight
  }

  const computedLineHeight = parseLength(window.getComputedStyle(textElem).lineHeight, fontSize)
  if (Number.isFinite(computedLineHeight) && computedLineHeight > 0) {
    return computedLineHeight
  }

  const inlineLineHeight = parseLength(getStyleValue(textElem, LINE_HEIGHT_STYLE_REGEX), fontSize)
  if (Number.isFinite(inlineLineHeight) && inlineLineHeight > 0) {
    return inlineLineHeight
  }

  const attrLineHeight = parseLength(textElem?.getAttribute('line-height') || '', fontSize)
  if (Number.isFinite(attrLineHeight) && attrLineHeight > 0) {
    return attrLineHeight
  }

  return fontSize * 1.2
}

const buildFontShorthand = (textElem) => {
  const computedStyle = window.getComputedStyle(textElem)
  const fontStyle = computedStyle.fontStyle || textElem.getAttribute('font-style') || 'normal'
  const fontWeight = computedStyle.fontWeight || textElem.getAttribute('font-weight') || 'normal'
  const fontSize = computedStyle.fontSize || `${getTextFontSize(textElem)}px`
  const fontFamily = computedStyle.fontFamily || textElem.getAttribute('font-family') || 'sans-serif'
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

const getLineHeight = (textElem) => {
  return getTextLineHeight(textElem)
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

const getBBoxSafe = (textElem) => {
  try {
    return textElem.getBBox()
  } catch {
    return null
  }
}

const getShapeInsideFrameRect = (textElem) => {
  const explicitRef = textElem.getAttribute('data-svgedit-shape-inside-ref')
  if (explicitRef?.startsWith('#')) {
    return document.getElementById(explicitRef.slice(1))
  }

  const styleAttr = textElem.getAttribute('style') || ''
  const match = styleAttr.match(SHAPE_INSIDE_REF_REGEX)
  if (!match?.[2]?.startsWith('#')) {
    return null
  }
  return document.getElementById(match[2].slice(1))
}

const getFirstRenderedLine = (textElem) => {
  return textElem.querySelector('tspan') || textElem
}

const findContainingDefsRect = ({ textElem, bbox, firstLine }) => {
  const defs = textElem.ownerSVGElement?.querySelector('defs')
  if (!defs) {
    return null
  }

  const pointX = toNumber(firstLine?.getAttribute?.('x'), Number.NaN)
  const pointY = toNumber(firstLine?.getAttribute?.('y'), Number.NaN)
  const fallbackX = Number.isFinite(bbox?.x) && Number.isFinite(bbox?.width)
    ? bbox.x + bbox.width / 2
    : Number.NaN
  const fallbackY = Number.isFinite(bbox?.y) && Number.isFinite(bbox?.height)
    ? bbox.y + bbox.height / 2
    : Number.NaN
  const probeX = Number.isFinite(pointX) ? pointX : fallbackX
  const probeY = Number.isFinite(pointY) ? pointY : fallbackY
  if (!Number.isFinite(probeX) || !Number.isFinite(probeY)) {
    return null
  }

  const containingRects = [...defs.querySelectorAll('rect[id]')].filter((rect) => {
    const x = toNumber(rect.getAttribute('x'), Number.NaN)
    const y = toNumber(rect.getAttribute('y'), Number.NaN)
    const width = toNumber(rect.getAttribute('width'), Number.NaN)
    const height = toNumber(rect.getAttribute('height'), Number.NaN)
    return Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      probeX >= x &&
      probeX <= x + width &&
      probeY >= y &&
      probeY <= y + height
  })

  if (!containingRects.length) {
    return null
  }

  containingRects.sort((a, b) => {
    const areaA = toNumber(a.getAttribute('width'), 0) * toNumber(a.getAttribute('height'), 0)
    const areaB = toNumber(b.getAttribute('width'), 0) * toNumber(b.getAttribute('height'), 0)
    return areaA - areaB
  })

  return containingRects[0]
}

const resolveFrameWidth = ({ textElem, bbox, frameRect, fontSize }) => {
  const existingWidth = toNumber(textElem.getAttribute(WRAP_WIDTH_ATTR), Number.NaN)
  if (Number.isFinite(existingWidth) && existingWidth > 0) {
    return existingWidth
  }

  const frameWidth = toNumber(frameRect?.getAttribute('width'), Number.NaN)
  if (Number.isFinite(frameWidth) && frameWidth > 0) {
    return frameWidth
  }

  const bboxWidth = Number.isFinite(bbox?.width) ? bbox.width : 0
  return Math.max(DEFAULT_PROMOTED_FRAME_WIDTH, Math.ceil(bboxWidth + fontSize))
}

const resolveFrameHeight = ({ textElem, bbox, frameRect, lineHeight }) => {
  const existingHeight = toNumber(textElem.getAttribute(WRAP_HEIGHT_ATTR), Number.NaN)
  if (Number.isFinite(existingHeight) && existingHeight > 0) {
    return existingHeight
  }

  const frameHeight = toNumber(frameRect?.getAttribute('height'), Number.NaN)
  if (Number.isFinite(frameHeight) && frameHeight > 0) {
    return frameHeight
  }

  const bboxHeight = Number.isFinite(bbox?.height) ? bbox.height : lineHeight
  return Math.max(DEFAULT_PROMOTED_FRAME_HEIGHT, Math.ceil(Math.max(bboxHeight, lineHeight) * 2))
}

const resolveFrameX = ({ textElem, bbox, frameRect, frameWidth, firstLine }) => {
  const frameX = toNumber(frameRect?.getAttribute('x'), Number.NaN)
  if (Number.isFinite(frameX)) {
    return frameX
  }

  const anchor = textElem.getAttribute('text-anchor') || 'start'
  const textX = toNumber(textElem.getAttribute('x'), Number.NaN)
  if (Number.isFinite(textX)) {
    if (anchor === 'middle') {
      return textX - frameWidth / 2
    }
    if (anchor === 'end') {
      return textX - frameWidth
    }
    return textX
  }

  const lineX = toNumber(firstLine?.getAttribute?.('x'), Number.NaN)
  if (Number.isFinite(lineX)) {
    return lineX
  }

  if (Number.isFinite(bbox?.x)) {
    return bbox.x
  }

  return 0
}

const resolveFrameY = ({ textElem, bbox, frameRect, fontSize, firstLine }) => {
  const frameY = toNumber(frameRect?.getAttribute('y'), Number.NaN)
  if (Number.isFinite(frameY)) {
    return frameY
  }

  const textY = toNumber(textElem.getAttribute('y'), Number.NaN)
  if (Number.isFinite(textY)) {
    return textY - fontSize
  }

  const lineY = toNumber(firstLine?.getAttribute?.('y'), Number.NaN)
  if (Number.isFinite(lineY)) {
    return lineY - fontSize
  }

  if (Number.isFinite(bbox?.y)) {
    return bbox.y
  }

  return 0
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

  const fontSize = getTextFontSize(textElem)
  const lineHeight = getLineHeight(textElem)
  const bbox = getBBoxSafe(textElem)
  const firstLine = getFirstRenderedLine(textElem)
  const frameRect = getShapeInsideFrameRect(textElem) || findContainingDefsRect({ textElem, bbox, firstLine })
  const promotedWidth = resolveFrameWidth({ textElem, bbox, frameRect, fontSize })
  const promotedHeight = resolveFrameHeight({ textElem, bbox, frameRect, lineHeight })
  const frameX = resolveFrameX({ textElem, bbox, frameRect, frameWidth: promotedWidth, firstLine })
  const frameY = resolveFrameY({ textElem, bbox, frameRect, fontSize, firstLine })

  textElem.setAttribute(WRAP_WIDTH_ATTR, String(promotedWidth))
  textElem.setAttribute(WRAP_HEIGHT_ATTR, String(promotedHeight))
  textElem.setAttribute(LINE_HEIGHT_ATTR, String(lineHeight))
  textElem.setAttribute('x', String(frameX))
  textElem.setAttribute('y', String(frameY + fontSize))
  textElem.setAttribute('text-anchor', 'start')

  if (frameRect?.id) {
    textElem.setAttribute('data-svgedit-shape-inside-ref', `#${frameRect.id}`)
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

  const fontSize = getTextFontSize(textElem)
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
