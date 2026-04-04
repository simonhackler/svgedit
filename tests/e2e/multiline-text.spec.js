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

async function commitMultilineEdit (page) {
  await page.locator('#svgroot').click({ position: { x: 40, y: 40 } })
}

async function getMultilineSnapshot (page, textId) {
  return page.evaluate((id) => {
    const textNode = document.getElementById(id)
    if (!textNode) {
      return null
    }

    const frameRef = textNode.getAttribute('data-svgedit-shape-inside-ref')
    const frame = frameRef?.startsWith('#')
      ? document.querySelector(`defs ${frameRef}`)
      : null

    return {
      id,
      x: textNode.getAttribute('x'),
      y: textNode.getAttribute('y'),
      rawText: textNode.getAttribute('data-svgedit-raw-text'),
      wrapWidth: textNode.getAttribute('data-svgedit-wrap-width'),
      wrapHeight: textNode.getAttribute('data-svgedit-wrap-height'),
      lines: [...textNode.querySelectorAll('tspan')].map((tspan) => ({
        text: tspan.textContent,
        empty: tspan.getAttribute('data-svgedit-empty-line') === 'true'
      })),
      frame: frame
        ? {
            x: frame.getAttribute('x'),
            y: frame.getAttribute('y'),
            width: frame.getAttribute('width'),
            height: frame.getAttribute('height')
          }
        : null
    }
  }, textId)
}

async function expectSnapshot (page, textId, expected) {
  await expect.poll(async () => getMultilineSnapshot(page, textId)).toEqual(expected)
}

function getResizeSnapshot (snapshot) {
  return {
    wrapWidth: snapshot?.wrapWidth ?? null,
    wrapHeight: snapshot?.wrapHeight ?? null,
    frameWidth: snapshot?.frame?.width ?? null,
    frameHeight: snapshot?.frame?.height ?? null
  }
}

async function clickToolbarUntil (page, buttonSelector, predicate, maxClicks = 6) {
  for (let i = 0; i <= maxClicks; i++) {
    if (await predicate()) {
      return
    }
    if (i < maxClicks) {
      await page.locator(buttonSelector).click()
    }
  }
  throw new Error(`Condition was not met after clicking ${buttonSelector} ${maxClicks} times`)
}

async function getVisibleTextResizeGrip (page) {
  return page.locator('[id^="selectedTextResizeGrip"]').filter({ visible: true })
}

async function getTextCenter (page, textId) {
  return page.evaluate((id) => {
    const textNode = document.getElementById(id)
    if (!textNode) {
      return null
    }
    const bbox = textNode.getBBox()
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2
    }
  }, textId)
}

async function clickTextOnCanvas (page, textId, clickCount = 1) {
  const center = await getTextCenter(page, textId)
  const svgBox = await page.locator('#svgroot').boundingBox()
  expect(center).not.toBeNull()
  expect(svgBox).not.toBeNull()
  await page.mouse.click(svgBox.x + center.x, svgBox.y + center.y, { clickCount })
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

async function getLineAndCursorMetrics (page, textSelector, lineIndex) {
  return page.evaluate(({ selector, lineIndex }) => {
    const textNode = document.querySelector(selector)
    const cursor = document.getElementById('text_cursor')
    const tspan = textNode?.querySelectorAll('tspan')?.[lineIndex]
    if (!textNode || !cursor || !tspan) {
      return null
    }

    const bbox = tspan.getBBox()
    return {
      line: {
        x: bbox.x,
        width: bbox.width
      },
      cursor: {
        x1: Number(cursor.getAttribute('x1')),
        x2: Number(cursor.getAttribute('x2'))
      }
    }
  }, { selector: textSelector, lineIndex })
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

  test('typing after two blank lines keeps the visible cursor at the text end', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })

    const editor = page.locator('#text_multiline')
    await expect(editor).toBeVisible()
    await editor.press('Enter')
    await editor.press('Enter')
    await editor.pressSequentially('k')

    const text = await getSelectedMultilineText(page)
    const metrics = await getLineAndCursorMetrics(page, `#${await text.getAttribute('id')}`, 2)
    expect(metrics).not.toBeNull()
    expect(metrics.cursor.x1).toBeGreaterThan(metrics.line.x + 1)
    expect(metrics.cursor.x2).toBeGreaterThan(metrics.line.x + 1)
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

  test('undo and redo restore a created multiline text element', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })
    await fillMultilineText(page, ['first line', 'second line'])
    const textNode = await getSelectedMultilineText(page)
    const textId = await textNode.getAttribute('id')
    await commitMultilineEdit(page)

    const createdSnapshot = await getMultilineSnapshot(page, textId)
    expect(createdSnapshot).not.toBeNull()

    await clickToolbarUntil(page, '#tool_undo', async () => {
      return (await page.locator(`#${textId}`).count()) === 0
    })

    await clickToolbarUntil(page, '#tool_redo', async () => {
      return (await getMultilineSnapshot(page, textId)) !== null
    })

    await expectSnapshot(page, textId, createdSnapshot)
  })

  test.fixme('undo and redo restore multiline text edits', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })
    await fillMultilineText(page, ['first line', 'second line'])
    const textNode = await getSelectedMultilineText(page)
    const textId = await textNode.getAttribute('id')
    await commitMultilineEdit(page)

    const originalSnapshot = await getMultilineSnapshot(page, textId)
    await page.locator(`#${textId}`).dblclick({ force: true })
    await fillMultilineText(page, ['edited line', '', 'third line'])
    await commitMultilineEdit(page)

    const editedSnapshot = await getMultilineSnapshot(page, textId)
    expect(editedSnapshot).not.toEqual(originalSnapshot)

    await clickToolbarUntil(page, '#tool_undo', async () => {
      const current = await getMultilineSnapshot(page, textId)
      return current?.rawText === originalSnapshot.rawText
    })

    await expect.poll(async () => (await getMultilineSnapshot(page, textId))?.rawText).toBe(originalSnapshot.rawText)

    await clickToolbarUntil(page, '#tool_redo', async () => {
      const current = await getMultilineSnapshot(page, textId)
      return current?.rawText === editedSnapshot.rawText
    })

    await expect.poll(async () => (await getMultilineSnapshot(page, textId))?.rawText).toBe(editedSnapshot.rawText)
  })

  test.fixme('undo and redo restore multiline text movement', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })
    await fillMultilineText(page, ['move me'])
    const textNode = await getSelectedMultilineText(page)
    const textId = await textNode.getAttribute('id')
    await commitMultilineEdit(page)

    const originalSnapshot = await getMultilineSnapshot(page, textId)
    await clickTextOnCanvas(page, textId)
    await page.locator('#selected_x').evaluate((el) => {
      el.value = String(Number(el.value) + 20)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const movedSnapshot = await getMultilineSnapshot(page, textId)
    expect(movedSnapshot).not.toBeNull()
    expect(movedSnapshot.x).not.toBe(originalSnapshot.x)

    await clickToolbarUntil(page, '#tool_undo', async () => {
      const current = await getMultilineSnapshot(page, textId)
      return current?.x === originalSnapshot.x
    })

    await expect.poll(async () => (await getMultilineSnapshot(page, textId))?.x).toBe(originalSnapshot.x)

    await clickToolbarUntil(page, '#tool_redo', async () => {
      const current = await getMultilineSnapshot(page, textId)
      return current?.x === movedSnapshot.x
    })

    await expect.poll(async () => (await getMultilineSnapshot(page, textId))?.x).toBe(movedSnapshot.x)
  })

  test.fixme('undo and redo restore multiline frame resizing', async ({ page }) => {
    await page.locator('#tool_text_multiline').click()
    await page.locator('#svgroot').dragTo(page.locator('#svgroot'), {
      sourcePosition: { x: 80, y: 100 },
      targetPosition: { x: 260, y: 220 }
    })
    await fillMultilineText(page, ['one two three four five six seven eight'])
    const textNode = await getSelectedMultilineText(page)
    const textId = await textNode.getAttribute('id')
    await commitMultilineEdit(page)

    const originalSnapshot = await getMultilineSnapshot(page, textId)
    const originalResize = getResizeSnapshot(originalSnapshot)
    await clickTextOnCanvas(page, textId)

    const resizeGrip = await getVisibleTextResizeGrip(page)
    const gripBox = await resizeGrip.boundingBox()
    const svgBox = await page.locator('#svgroot').boundingBox()
    expect(gripBox).not.toBeNull()
    expect(svgBox).not.toBeNull()

    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(svgBox.x + 160, svgBox.y + 180)
    await page.mouse.up()

    const resizedSnapshot = await getMultilineSnapshot(page, textId)
    const resizedResize = getResizeSnapshot(resizedSnapshot)
    expect(resizedResize.wrapWidth).not.toBe(originalResize.wrapWidth)
    expect(resizedResize.wrapHeight).not.toBe(originalResize.wrapHeight)
    expect(resizedResize.frameWidth).not.toBe(originalResize.frameWidth)
    expect(resizedResize.frameHeight).not.toBe(originalResize.frameHeight)

    await clickToolbarUntil(page, '#tool_undo', async () => {
      const current = getResizeSnapshot(await getMultilineSnapshot(page, textId))
      return JSON.stringify(current) === JSON.stringify(originalResize)
    })

    await expect.poll(async () => getResizeSnapshot(await getMultilineSnapshot(page, textId))).toEqual(originalResize)

    await clickToolbarUntil(page, '#tool_redo', async () => {
      const current = getResizeSnapshot(await getMultilineSnapshot(page, textId))
      return JSON.stringify(current) === JSON.stringify(resizedResize)
    })

    await expect.poll(async () => getResizeSnapshot(await getMultilineSnapshot(page, textId))).toEqual(resizedResize)
  })
})
