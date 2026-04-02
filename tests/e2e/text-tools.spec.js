import { test, expect } from './fixtures.js'
import { clickCanvas, dragOnCanvas, setSvgSource, visitAndApproveStorage } from './helpers.js'

test.describe('Text tools', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })



  test('multiline input renders tspans', async ({ page }) => {
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

    await expect(page.locator('#svg_1 tspan')).toHaveCount(2)
    await expect(page.locator('#svg_1 tspan').nth(0)).toHaveText('first line')
    await expect(page.locator('#svg_1 tspan').nth(1)).toHaveText('second line')
  })

  test('creates and styles text', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="200" y="200">AB</text>
      </g>
    </svg>`)

    const firstText = page.locator('#svg_1')
    await expect(firstText).toBeVisible()

    await firstText.click()
    await page.locator('#tool_clone').click()
    await expect(page.locator('#svg_2')).toBeVisible()

    await firstText.click()
    await page.locator('#tool_bold').click()
    await page.locator('#tool_italic').click()
  })

  test('multiline tool drag creates wrapped frame metadata and tspans', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await dragOnCanvas(page, { x: 80, y: 100 }, { x: 260, y: 220 })

    const textNodes = page.locator('#svgcontent text')
    await expect(textNodes).toHaveCount(1)
    const textNode = textNodes.first()
    await expect(textNode).toHaveAttribute('data-svgedit-multiline', 'true')

    const wrapWidth = await textNode.getAttribute('data-svgedit-wrap-width')
    const wrapHeight = await textNode.getAttribute('data-svgedit-wrap-height')
    expect(Number(wrapWidth)).toBeGreaterThan(100)
    expect(Number(wrapHeight)).toBeGreaterThan(50)

    const multilineInput = page.locator('#text_multiline')
    await multilineInput.fill('first line\nsecond line')

    await expect(textNode.locator('tspan')).toHaveCount(2)
    await expect(textNode.locator('tspan').nth(0)).toHaveText('first line')
    await expect(textNode.locator('tspan').nth(1)).toHaveText('second line')
  })

  test('multiline click creates default frame dimensions', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await clickCanvas(page, { x: 140, y: 160 })

    const textNode = page.locator('#svgcontent text').first()
    await expect(textNode).toHaveAttribute('data-svgedit-multiline', 'true')

    const wrapWidth = Number(await textNode.getAttribute('data-svgedit-wrap-width'))
    const wrapHeight = Number(await textNode.getAttribute('data-svgedit-wrap-height'))

    expect(wrapWidth).toBe(240)
    expect(wrapHeight).toBe(120)
  })
})
