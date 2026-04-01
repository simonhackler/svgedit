import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import { NS } from './namespaces.js'

const RAW_TEXT_ATTR = 'data-svgedit-raw-text'
const WRAP_WIDTH_ATTR = 'data-svgedit-wrap-width'
const LINE_HEIGHT_ATTR = 'data-svgedit-line-height'

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

  if (!hasHardBreaks && !hasWrapWidth) {
    clearTextChildren(textElem)
    textElem.textContent = normalizedText
    textElem.removeAttribute(RAW_TEXT_ATTR)
    return
  }

  const font = buildFontShorthand(textElem)
  const lineHeight = getLineHeight(textElem)
  const wrapWidth = getWrapWidth(textElem)
  const prepared = prepareWithSegments(normalizedText, font, { whiteSpace: 'pre-wrap' })
  const { lines } = layoutWithLines(prepared, wrapWidth, lineHeight)

  clearTextChildren(textElem)
  const x = textElem.getAttribute('x') || '0'

  lines.forEach((line, index) => {
    const tspan = document.createElementNS(NS.SVG, 'tspan')
    tspan.setAttribute('x', x)
    tspan.setAttribute('dy', index === 0 ? '0' : String(lineHeight))
    tspan.textContent = line.text
    textElem.append(tspan)
  })

  textElem.setAttribute(RAW_TEXT_ATTR, normalizedText)
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
  return Boolean(raw && (raw.includes('\n') || raw.includes('\r'))) || hasWrapWidth
}
