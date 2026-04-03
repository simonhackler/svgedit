import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

async function getSelectedMultilineText (page) {
  const textId = await page.waitForFunction(() => {
    const texts = [...document.querySelectorAll('#svgcontent text')]
    const multilineText = texts.find((text) => text.getAttribute('data-svgedit-multiline') === 'true')
    return multilineText?.id || null
  })

  return page.locator(`#${await textId.jsonValue()}`)
}

async function expectBackedFrame (page, textNode, expected) {
  const frameRef = await textNode.getAttribute('data-svgedit-shape-inside-ref')
  expect(frameRef).toMatch(/^#.+/)

  const frame = page.locator(`defs ${frameRef}`)
  await expect(frame).toHaveAttribute('data-svgedit-text-frame', 'true')
  await expect(frame).toHaveAttribute('data-svgedit-frame-for', 'shape-inside')
  await expect(frame).toHaveAttribute('width', String(expected.width))
  await expect(frame).toHaveAttribute('height', String(expected.height))
}

async function fillMultilineText (page, lines) {
  const editor = page.locator('#text_multiline')
  await expect(editor).toBeVisible()
  await editor.fill(lines.join('\n'))
}

async function getMultilineCursorGeometry (page, textSelector) {
  return page.evaluate((selector) => {
    const textNode = document.querySelector(selector)
    const cursor = document.getElementById('text_cursor')
    if (!textNode || !cursor) {
      return null
    }

    const fontSize = Number(textNode.getAttribute('font-size')) || 16
    const frameX = Number(textNode.getAttribute('x')) || 0
    const frameY = (Number(textNode.getAttribute('y')) || fontSize) - fontSize
    const frameWidth = Number(textNode.getAttribute('data-svgedit-wrap-width')) || 0
    const frameHeight = Number(textNode.getAttribute('data-svgedit-wrap-height')) || 0

    return {
      cursor: {
        x1: Number(cursor.getAttribute('x1')),
        y1: Number(cursor.getAttribute('y1')),
        x2: Number(cursor.getAttribute('x2')),
        y2: Number(cursor.getAttribute('y2')),
        visibility: cursor.getAttribute('visibility'),
        display: cursor.getAttribute('display')
      },
      frame: {
        left: frameX,
        top: frameY,
        right: frameX + frameWidth,
        bottom: frameY + frameHeight
      }
    }
  }, textSelector)
}

async function getTspanMetrics (page, textSelector) {
  return page.evaluate((selector) => {
    const textNode = document.querySelector(selector)
    if (!textNode) {
      return []
    }

    return [...textNode.querySelectorAll('tspan')].map((tspan) => {
      const bbox = tspan.getBBox()
      const yAttr = tspan.getAttribute('y')
      return {
        outerHTML: tspan.outerHTML,
        text: tspan.textContent,
        yAttr,
        x: bbox.x,
        y: yAttr === null ? bbox.y : Number(yAttr),
        height: bbox.height
      }
    })
  }, textSelector)
}

test.describe('Multiline text', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('multiline text edits in place for an existing text element', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="120" y="120" data-svgedit-multiline="true">A</text>
      </g>
    </svg>`)

    const text = page.locator('#svg_1')
    await text.dblclick()

    await fillMultilineText(page, ['first line', 'second line'])

    await expect(text.locator('tspan')).toHaveCount(2)
    await expect(text.locator('tspan').nth(0)).toHaveText('first line')
    await expect(text.locator('tspan').nth(1)).toHaveText('second line')
    await expect(text).toHaveAttribute('data-svgedit-raw-text', 'first line\nsecond line')
  })

  test('multiline text preserves blank lines while editing in place', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    const editor = page.locator('#text_multiline')
    await expect(editor).toBeVisible()
    await editor.pressSequentially('first line')
    await editor.press('Enter')
    await editor.press('Enter')
    await editor.pressSequentially('third line')

    await expect(editor).toHaveValue('first line\n\nthird line')
    const text = await getSelectedMultilineText(page)
    const textSelector = `#${await text.getAttribute('id')}`
    await expect(text).toHaveAttribute('data-svgedit-raw-text', 'first line\n\nthird line')
    await expect(text.locator('tspan')).toHaveCount(3)
    await expect(text.locator('tspan').nth(0)).toHaveText('first line')
    await expect(text.locator('tspan').nth(2)).toHaveText('third line')
    const lineMetrics = await getTspanMetrics(page, textSelector)
    expect(lineMetrics).toHaveLength(3)
    expect(lineMetrics[1].y).toBeGreaterThan(lineMetrics[0].y + 10)
    expect(lineMetrics[2].y).toBeGreaterThan(lineMetrics[1].y + 10)
  })

  test('multiline text preserves leading blank lines while creating new content', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    const editor = page.locator('#text_multiline')
    await expect(editor).toBeVisible()
    await editor.press('Enter')
    await editor.press('Enter')
    await editor.pressSequentially('third line')

    const text = await getSelectedMultilineText(page)
    const textSelector = `#${await text.getAttribute('id')}`
    await expect(editor).toHaveValue('\n\nthird line')
    await expect(text).toHaveAttribute('data-svgedit-raw-text', '\n\nthird line')
    await expect(text.locator('tspan')).toHaveCount(3)
    await expect(text.locator('tspan').nth(2)).toHaveText('third line')
    const lineMetrics = await getTspanMetrics(page, textSelector)
    expect(lineMetrics).toHaveLength(3)
    expect(lineMetrics[1].y).toBeGreaterThan(lineMetrics[0].y + 10)
    expect(lineMetrics[2].y).toBeGreaterThan(lineMetrics[1].y + 10)
  })

  test('dragging multiline text creates a backed frame and wrapped content', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    const textNode = await getSelectedMultilineText(page)
    await expect(textNode).toHaveAttribute('data-svgedit-wrap-width', '180')
    await expect(textNode).toHaveAttribute('data-svgedit-wrap-height', '120')
    await expectBackedFrame(page, textNode, { width: 180, height: 120 })

    await fillMultilineText(page, ['first line', 'second line'])

    await expect(textNode.locator('tspan')).toHaveCount(2)
    await expect(textNode.locator('tspan').nth(0)).toHaveText('first line')
    await expect(textNode.locator('tspan').nth(1)).toHaveText('second line')
  })

  test('multiline edit keeps the visible SVG caret inside the wrapped text frame', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    await fillMultilineText(page, [
      'one two three four five six',
      'seven eight nine ten',
      'eleven twelve'
    ])

    const textNode = await getSelectedMultilineText(page)
    const geometry = await getMultilineCursorGeometry(page, `#${await textNode.getAttribute('id')}`)
    expect(geometry).not.toBeNull()
    expect(geometry.cursor.visibility).toBe('visible')
    expect(geometry.cursor.display).toBe('inline')
    expect(geometry.cursor.x1).toBeGreaterThanOrEqual(geometry.frame.left)
    expect(geometry.cursor.x1).toBeLessThanOrEqual(geometry.frame.right)
    expect(geometry.cursor.x2).toBeGreaterThanOrEqual(geometry.frame.left)
    expect(geometry.cursor.x2).toBeLessThanOrEqual(geometry.frame.right)
    expect(geometry.cursor.y1).toBeGreaterThanOrEqual(geometry.frame.top)
    expect(geometry.cursor.y1).toBeLessThanOrEqual(geometry.frame.bottom)
    expect(geometry.cursor.y2).toBeGreaterThanOrEqual(geometry.frame.top)
    expect(geometry.cursor.y2).toBeLessThanOrEqual(geometry.frame.bottom)
  })

  test('clicking multiline text creates the default frame size and backing rect', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').click({ position: { x: 140, y: 160 } })

    const textNode = await getSelectedMultilineText(page)
    await expect(textNode).toHaveAttribute('data-svgedit-wrap-width', '240')
    await expect(textNode).toHaveAttribute('data-svgedit-wrap-height', '120')
    await expectBackedFrame(page, textNode, { width: 240, height: 120 })
  })

  test('multiline tool exposes a bottom-right resize handle for the wrapped frame', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    const textNode = await getSelectedMultilineText(page)
    await fillMultilineText(page, ['one two three four five six seven eight'])
    await page.locator('#svgroot').click({ position: { x: 40, y: 40 } })

    const resizeGrip = page.locator('[id^="selectedTextResizeGrip"]')
    await expect(resizeGrip).toBeVisible()
    const gripBox = await resizeGrip.boundingBox()
    const svgBox = await page.locator('#svgroot').boundingBox()
    expect(gripBox).not.toBeNull()
    expect(svgBox).not.toBeNull()

    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(svgBox.x + 160, svgBox.y + 180)
    await page.mouse.up()

    await expect(textNode).toHaveAttribute('data-svgedit-wrap-width', '80')
    await expect(textNode).toHaveAttribute('data-svgedit-wrap-height', '80')
    await expectBackedFrame(page, textNode, { width: 80, height: 80 })
  })
})
