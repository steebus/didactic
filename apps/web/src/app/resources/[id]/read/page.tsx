import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { signedSource } from '@/lib/document'
import { SheetNav } from '@/components/SheetNav'
import { Viewer } from './Viewer'
import styles from './page.module.css'

/**
 * A document, opened where it was filed.
 *
 * The file is shown in the browser's own PDF viewer rather than drawn
 * here. That viewer already has page navigation, zoom, search, rotate
 * and print, it is the one the reader knows, and it costs nothing to
 * ship -- where rendering the pages ourselves would mean carrying pdfjs
 * into the browser to rebuild controls that are already there. What is
 * ours is the frame around it: the way back, and the title, so a
 * document opened from the shelf is still a sheet of this catalogue
 * rather than a file that took the window.
 *
 * The URL is signed here, on the server, and lasts the quarter of an
 * hour `signedSource` gives it. The bucket stays private: nothing about
 * this makes a document reachable by anyone who was not already allowed
 * to ask for it.
 */
export default async function ReadDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = supabaseAdmin()

  const [userId, { data: resource }] = await Promise.all([
    requireOwner(),
    db
      .from('resources')
      .select('id, user_id, title, kind, storage_path, file_size')
      .eq('id', id)
      .maybeSingle(),
  ])

  // Not found rather than forbidden for someone else's document: the
  // answer to "does this exist" is not one a stranger is owed either.
  if (!resource || resource.user_id !== userId) notFound()

  // A book recorded by title, or a link: there is no file to open. The
  // shelf only offers this on a document, so arriving here for one of
  // those is a typed address rather than a broken button.
  if (!resource.storage_path) notFound()

  let url: string
  try {
    ;({ url } = await signedSource(db, resource.storage_path))
  } catch (e) {
    // The row says there is a file and the bucket disagrees. Worth
    // saying plainly: it is the difference between "we cannot show
    // this" and a viewer that renders nothing and explains nothing.
    return (
      <main className={styles.sheet}>
        <header className={styles.head}>
          <SheetNav back={{ href: '/inbox', label: 'Inbox' }} />
          <h1 className={styles.title}>{resource.title}</h1>
        </header>
        <div className={styles.headRule} />
        <div className={styles.body}>
          <p className={styles.problem}>
            This document is on the shelf, but the file behind it could not be
            reached — {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/inbox', label: 'Inbox' }} />
        <div className={styles.headRow}>
          <h1 className={styles.title}>{resource.title}</h1>
          {/* The way out of the frame, for printing, or for a viewer
              the reader would rather use than the one in the page. */}
          <a
            className={styles.plain}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on its own
          </a>
        </div>
      </header>
      <div className={styles.headRule} />

      <Viewer url={url} title={resource.title} />
    </main>
  )
}
