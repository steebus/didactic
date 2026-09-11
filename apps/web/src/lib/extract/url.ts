import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export function extractFromHtml(html: string, url: string) {
  const dom = new JSDOM(html, { url })
  const parsed = new Readability(dom.window.document).parse()
  if (!parsed?.textContent?.trim()) {
    throw new Error('extract: no readable content')
  }
  return {
    title: parsed.title || url,
    text: parsed.textContent.trim(),
  }
}

export async function fetchAndExtract(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'didactic/1.0' } })
  if (!res.ok) throw new Error(`extract: fetch failed ${res.status}`)
  return extractFromHtml(await res.text(), url)
}
