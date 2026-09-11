import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOwner } from '@/lib/auth'
import { getSourcePage } from '@/lib/source'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'

/**
 * Where a citation goes.
 *
 * The passage, not the PDF. What the reader wanted when they pressed a
 * citation mid-sentence was the sentence it came from, and a rendered
 * page of a book is a slower, heavier and less readable way of giving
 * them that -- it needs a viewer, it needs pinch-zoom on a phone, and
 * inside the WebView the lesson body runs in on the phone it is the
 * first thing that would break.
 *
 * So the words are printed, in the app's own type, with the page they
 * came off and the chapter they sit in. The document itself is one
 * press away for anyone who wants the real page -- the figure, the
 * table, the typography -- and that press hands them a signed link and
 * the browser's own viewer, opened at the right page.
 */
export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const [, { id }, { page: asked }] = await Promise.all([
    requireOwner(),
    params,
    searchParams,
  ])

  const wanted = asked && /^\d+$/.test(asked) ? Number(asked) : null
  const source = await getSourcePage(id, wanted)
  if (!source) notFound()

  const stepTo = (page: number) => `/source/${source.id}?page=${page}`

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="library" />
        <p className={styles.eyebrow}>Cited from</p>
        <h1 className={styles.title}>{source.title}</h1>
        <p className={styles.where}>
          {source.page ? `Page ${source.page}` : 'The document'}
          {source.pageCount ? ` of ${source.pageCount}` : ''}
          {source.heading ? ` · ${source.heading}` : ''}
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {source.passages.length === 0 ? (
          <p className={styles.nothing}>
            Nothing was read off this page. It may carry only a figure or a table
            {source.fileUrl ? ', which the document itself will show.' : '.'}
          </p>
        ) : (
          source.passages.map(passage => (
            <blockquote key={passage.id} className={styles.passage}>
              {passage.content.split(/\n\s*\n/).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
              {passage.pageTo > passage.pageFrom && (
                <cite className={styles.runsOn}>
                  runs from page {passage.pageFrom} to {passage.pageTo}
                </cite>
              )}
            </blockquote>
          ))
        )}

        <nav className={styles.steps}>
          {source.previousPage !== null && (
            <Link href={stepTo(source.previousPage)} className={styles.step}>
              ← Page {source.previousPage}
            </Link>
          )}
          {source.nextPage !== null && (
            <Link href={stepTo(source.nextPage)} className={`${styles.step} ${styles.next}`}>
              Page {source.nextPage} →
            </Link>
          )}
        </nav>

        {source.fileUrl && (
          <p className={styles.whole}>
            <a href={source.fileUrl} target="_blank" rel="noreferrer">
              Open the document itself
            </a>
            {source.page ? `, at page ${source.page}.` : '.'} The link is good for
            fifteen minutes.
          </p>
        )}
      </div>
    </main>
  )
}
