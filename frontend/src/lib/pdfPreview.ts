/**
 * 按需加载 pdfjs（只有真正处理 PDF 时才下载，避免拖累首屏包体）
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })()
  }
  return pdfjsPromise
}

/** 将 PDF 第一页渲染为 PNG data URL，用于上传时的本地预览 */
export async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs()
  const buf = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buf })
  const pdf = await loadingTask.promise
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2, 1400 / baseViewport.width)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布上下文')
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL('image/png')
    page.cleanup()
    return dataUrl
  } finally {
    await loadingTask.destroy()
  }
}
