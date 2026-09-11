import { PDFParse } from 'pdf-parse'

export async function extractFromPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer })
  try {
    const [text, info] = await Promise.all([parser.getText(), parser.getInfo()])
    if (!text.text?.trim()) throw new Error('extract: no readable content')
    return {
      title: info.info?.Title || 'Untitled PDF',
      text: text.text.trim(),
    }
  } finally {
    await parser.destroy()
  }
}
