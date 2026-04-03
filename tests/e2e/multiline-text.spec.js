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

test.describe('Multiline text', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('multiline input renders tspans for an existing text element', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="120" y="120" data-svgedit-multiline="true">A</text>
      </g>
    </svg>`)

    const text = page.locator('#svg_1')
    await text.click()

    const multilineInput = page.locator('#text_multiline')
    await multilineInput.fill('first line\nsecond line')

    await expect(text.locator('tspan')).toHaveCount(2)
    await expect(text.locator('tspan').nth(0)).toHaveText('first line')
    await expect(text.locator('tspan').nth(1)).toHaveText('second line')
    await expect(text).toHaveAttribute('data-svgedit-raw-text', 'first line\nsecond line')
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

    const multilineInput = page.locator('#text_multiline')
    await multilineInput.fill('first line\nsecond line')

    await expect(textNode.locator('tspan')).toHaveCount(2)
    await expect(textNode.locator('tspan').nth(0)).toHaveText('first line')
    await expect(textNode.locator('tspan').nth(1)).toHaveText('second line')
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
    await page.locator('#text_multiline').fill('one two three four five six seven eight')

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
