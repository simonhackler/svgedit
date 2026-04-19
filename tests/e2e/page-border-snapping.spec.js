import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

const getRectBox = async (page, selector) => {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    return {
      x: Number(el.getAttribute('x')),
      y: Number(el.getAttribute('y')),
      width: Number(el.getAttribute('width')),
      height: Number(el.getAttribute('height'))
    }
  }, selector)
}

test.describe('Page border snapping', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.setConfig({
        lang: 'en',
        gridSnapping: true,
        pageBorderSnapping: true,
        snappingStep: 10
      })
      window.svgEditor.svgCanvas.setConfig({
        gridSnapping: true,
        pageBorderSnapping: true,
        snappingStep: 10
      })
    })
  })

  test('dragging a rect to the right border preserves the snapped final position', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <rect id="svg_1" x="560" y="40" width="35" height="40" fill="#00f" />
      </g>
    </svg>`)

    const rect = page.locator('#svg_1')
    await rect.click()
    const box = await rect.boundingBox()
    if (!box) throw new Error('Missing rect bounding box')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 10 })

    await expect.poll(async () => {
      return page.locator('#svg_1').getAttribute('transform')
    }).not.toBeNull()

    await page.mouse.up()

    await expect.poll(async () => getRectBox(page, '#svg_1')).toEqual({
      x: 605,
      y: 40,
      width: 35,
      height: 40
    })
  })

  test('resizing a rect snaps the right edge to the page border', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <rect id="svg_1" x="560" y="40" width="35" height="40" fill="#00f" />
      </g>
    </svg>`)

    const rect = page.locator('#svg_1')
    await rect.click()

    const resizeGrip = page.locator('#selectorGrip_resize_e')
    await expect(resizeGrip).toBeVisible()
    const gripBox = await resizeGrip.boundingBox()
    if (!gripBox) throw new Error('Missing resize grip bounds')

    const gripCenterX = gripBox.x + gripBox.width / 2
    const gripCenterY = gripBox.y + gripBox.height / 2
    await page.mouse.move(gripCenterX, gripCenterY)
    await page.mouse.down()
    await page.mouse.move(gripCenterX + 50, gripCenterY, { steps: 10 })
    await page.mouse.up()

    await expect.poll(async () => {
      const box = await getRectBox(page, '#svg_1')
      return {
        x: box?.x,
        y: box?.y,
        width: Math.round((box?.width || 0) * 1000) / 1000,
        height: box?.height,
        right: Math.round(((box?.x || 0) + (box?.width || 0)) * 1000) / 1000
      }
    }).toEqual({
      x: 560,
      y: 40,
      width: 80,
      height: 40,
      right: 640
    })
  })
})
