import { renderCanvasToPng } from './lib/renderCanvas.js'
import fs from 'fs'

const canvas = {
  id: "9ef8f4c3-b7ea-4d2c-aff4-1eeba4920496",
  width: 1080,
  height: 1080,
  groups: [
    {
      id: "g1",
      layout: "vertical",
      nodeIds: ["n1", "n2", "n3"],
      gaps: [{ gapX: 0, gapY: 10 }, { gapX: 0, gapY: 10 }]
    }
  ],
  nodes: [
    {
      id: "n1", type: "text", x: 100, y: 100, width: 800, height: 100,
      dynamic_key: "hook", text: "hook text", fontSize: 40
    },
    {
      id: "n2", type: "text", x: 100, y: 200, width: 800, height: 100,
      dynamic_key: "description", text: "desc", fontSize: 40
    },
    {
      id: "n3", type: "text", x: 100, y: 300, width: 800, height: 100,
      dynamic_key: "cta", text: "cta", fontSize: 40
    }
  ]
}

const data = {
  "background": "https://kand-five.vercel.app/api/uploads/6636d9d9-924f-42d4-8bfe-363b5851e266",
  "description": "New textNew textNew textNew text",
  "cta": "New textNew textNew textNew textNew text",
  "hook": "ÉPOSTAR TODOS OS DIAS É PERDA DE TEMPO.TEMPO.TEMPO.TEMPO."
}

async function test() {
  try {
    const png = await renderCanvasToPng(canvas, data)
    fs.writeFileSync('test.png', png)
    console.log("Success")
  } catch (e) {
    console.error(e)
  }
}

test()
