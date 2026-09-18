'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { viabilityFigure, vagueFigure } from '@didactic/core/scoring'
import { StockBar, stockState, STOCK_LABEL, STOCK_ORDER } from '@/components/StockBar'
import { useLabour, DRAWINGS } from '@/components/useLabour'
import { useOpenBed } from '@/components/useOpenBed'
import { routeProgress, ROUTE_LABEL } from '@didactic/core/progress'
import { orderSubjectOutline } from '@didactic/core/outline'
import { bandsOfBed, moveWithin, type TopicGroup } from '@didactic/core/groups'
import { grubbingOut } from '@didactic/core/adjudication'
import type { SubjectTopicRow, TopicTreeNode } from '@didactic/core/subject'
import styles from './page.module.css'

const api = didactic()

/**
 * The bed as a fixed outline: every topic in the subject, nested under
 * whatever it specialises or follows, with the material and routes
 * filed against each one.
 *
 * Fixed is the point. The graph is the other reading of this data, and
 * there position is emergent — good for seeing shape, useless for
 * finding the same topic twice. Here a topic is in the same place every
 * time, which is what makes adding and removing them a sensible thing
 * to do on this sheet rather than on the canvas.
 */
export function SubjectBed({
  subjectId,
  tree,
  groups,
  colour,
  sown,
  related,
}: {
  subjectId: string
  tree: TopicTreeNode[]
  /** The boxes this bed is read in. Empty is ordinary: a bed nobody has
   *  grouped yet prints as one flat list. */
  groups: TopicGroup[]
  colour: string
  /** Whether there is a sowing record to lay the bed out from again.
   *  Without one the offer still stands, but it rests on the subject's
   *  name alone and says so. */
  sown: boolean
  /** Connections with both ends inside this bed. Nought means the
   *  sowing never got to relate it, or it was grown by hand. */
  related: number
}) {
  const [sort, setSort] = useState<'outline' | 'condition'>('outline')
  // Editing is off by default: taking a topic out of a bed is a rare,
  // deliberate act, and a "Remove" against every row read as an
  // invitation to prune a map that is mostly meant to be read.
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [laying, setLaying] = useState(false)
  const labour = useLabour(laying)
  const [grouping, setGrouping] = useState(false)
  const grouped = useLabour(grouping)
  // The name being typed into a box, so a rename can be abandoned by
  // pressing Escape rather than only by putting the old name back.
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [naming, setNaming] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [drawing, setDrawing] = useState(false)
  const drawn = useLabour(drawing, DRAWINGS)
  const [, startTransition] = useTransition()
  const openBed = useOpenBed()
  const router = useRouter()

  /**
   * Lay out a bed that was sown but never planted.
   *
   * A sowing that runs out of the platform's minute part way leaves the
   * subject standing with nothing in it, because the subject is written
   * before its topics are. Everything it was sown from was kept, so the
   * remedy is a button rather than filling the sheet in a second time.
   */
  async function layOut() {
    setLaying(true)
    setError(null)
    setNote(null)
    try {
      const { ok, body, error: failed } = await api.subjects.resow(subjectId)
      if (!ok) throw new Error(failed ?? 'Could not lay out the bed.')

      // The same as a first sowing: a bed appearing is a bed appearing,
      // and it is opened at its beginning. The bench carries it from
      // here, so pressing this button does not tie the reader to the
      // sheet for the couple of minutes it takes.
      openBed(body.first)

      const sownCount = (body.topicsCreated ?? 0) + (body.linked ?? 0)
      setNote(
        [
          `${sownCount} ${sownCount === 1 ? 'topic' : 'topics'} sown.`,
          ...(body.warnings ?? []),
        ].join(' ')
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLaying(false)
    }
  }

  async function add() {
    const name = title.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const { ok, body, error: failed } = await api.subjects.addTopic(subjectId, name)
      if (!ok) throw new Error(failed ?? 'Could not add that.')

      // What actually happened, said plainly. Two readings decide it
      // now -- the resolver against the whole map, the sort against
      // this bed -- and saying which one spoke is the difference
      // between a map the user trusts and one that rearranges itself
      // behind them.
      // The count is absent where the sort never ran -- no key, an
      // unreadable bed -- which is not the same as nought edges drawn.
      // Either way there is nothing to say about placement.
      const drawn = body.placed ?? 0
      const placed =
        drawn > 0 ? ` Related to ${drawn} ${drawn === 1 ? 'topic' : 'topics'} here.` : ''

      setNote(
        [
          body.action === 'linked'
            ? `"${name}" already existed elsewhere on the map, so it has been filed here too — with its history.${placed}`
            : body.action === 'already-filed'
              ? `"${name}" is already in this subject.`
              : body.action === 'pending'
                ? body.queriedBy === 'sort'
                  ? `"${name}" reads as something already in this bed under another name, so it is waiting for you to say whether they are the same thing.`
                  : `"${name}" looks close to something you already have, so it is waiting for you to say whether they are the same thing.`
                : `"${name}" sown.${placed}`,
          body.note ?? '',
          ...(body.warnings ?? []),
        ].filter(Boolean).join(' ')
      )
      setTitle('')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Ask what leads to what across the whole bed.
   *
   * The sowing's last step, on its own. It is given up when the
   * platform's minute runs short, and a bed grown by hand never had it
   * at all -- adding a topic by name files it without ever asking what
   * it follows. Either way the graph can only scatter what it is given,
   * so this is how a bed gets its shape after the fact.
   */
  async function draw() {
    setDrawing(true)
    setError(null)
    setNote(null)
    try {
      const { ok, body, error: failed } = await api.subjects.relate(subjectId)
      if (!ok) throw new Error(failed ?? 'Could not draw the connections.')

      const count = body.drawn ?? 0
      setNote(
        [
          count === 0
            ? 'Nothing new to draw — everything the model would relate here is already related.'
            : `${count} ${count === 1 ? 'connection' : 'connections'} drawn across ${
                body.considered ?? 0
              } topics.`,
          ...(body.warnings ?? []),
        ].join(' ')
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setDrawing(false)
    }
  }

  /**
   * Grub a topic out from the bed it sits in.
   *
   * The sibling of `remove`, and the opposite of it. Taking a topic out
   * of a subject leaves it standing as loose stock with everything it
   * holds; this destroys it. They have looked like one action for as
   * long as both have existed -- the bed offered *Remove*, which reads
   * as a delete and is not one, and the actual delete lived only on the
   * graph canvas and on the loose sheet.
   *
   * The reckoning is read from the topic itself rather than from the
   * row: the bed carries resources and lessons but not marks or
   * readings, and the two things the reader most needs told are that
   * their marked passages survive and their reading log does not.
   */
  async function grub(topic: SubjectTopicRow) {
    setError(null)
    setNote(null)
    try {
      const { ok, error: failed } = await api.topics.remove(topic.id)
      if (!ok) throw new Error(failed ?? 'Could not grub that out.')

      setNote(`"${topic.title}" is off the map, with its routes and lessons.`)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  async function remove(topic: SubjectTopicRow) {
    setError(null)
    setNote(null)
    try {
      const { ok, body, error: failed } = await api.subjects.removeTopic(subjectId, topic.id)
      if (!ok) throw new Error(failed ?? 'Could not remove that.')

      setNote(
        body.loose
          ? `"${topic.title}" is out of this subject. It keeps everything filed against it and is now loose stock.`
          : `"${topic.title}" is out of this subject. It is still filed under the others it sits in.`
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  /**
   * Ask the model to divide the bed by subject matter.
   *
   * It replaces whatever boxes are there, which is why it asks first
   * where there is something to lose: a proposal is a starting point,
   * and quietly throwing away groups the reader arranged by hand would
   * make pressing this a gamble.
   */
  async function proposeGroups() {
    if (groups.length > 0 &&
        !confirm('This replaces the groups already here. The topics themselves are untouched.')) {
      return
    }
    setError(null)
    setNote(null)
    setGrouping(true)
    try {
      const { ok, body, error: failed } = await api.subjects.groupBed(subjectId)
      if (!ok) throw new Error(failed ?? 'Could not group the bed.')
      setNote(
        body.note ??
          `Grouped into ${body.groups.length} ${body.groups.length === 1 ? 'group' : 'groups'}. Rename or rearrange any of it under Edit.`
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setGrouping(false)
    }
  }

  /** Every hand edit to the boxes goes through here: the call is the
   *  same shape each time and only the body differs. */
  async function editGroups(
    body: Parameters<typeof api.subjects.editGroups>[1],
    said?: string
  ) {
    setError(null)
    setNote(null)
    try {
      const { ok, error: failed } = await api.subjects.editGroups(subjectId, body)
      if (!ok) throw new Error(failed ?? 'Could not change that.')
      if (said) setNote(said)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  async function removeGroup(group: TopicGroup) {
    setError(null)
    setNote(null)
    try {
      const { ok, error: failed } = await api.subjects.removeGroup(subjectId, group.id)
      if (!ok) throw new Error(failed ?? 'Could not remove that group.')
      setNote(`"${group.title}" is gone. The topics in it are still in the bed.`)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  const count = countTopics(tree)
  // The bed as bands: boxes with their topics, and the loose ones
  // between them. Grouping is the outline's reading -- condition asks a
  // flat question of the whole bed and a box would only get in its way.
  const bands = bandsOfBed(tree, groups)

  return (
    <section>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Topics</h2>
        <span className={styles.sectionNote}>
          {count === 0 ? (
            'Nothing sown'
          ) : (
            <>
              {count} {count === 1 ? 'topic' : 'topics'}
              {' · '}
              {/* Two readings of one bed, both flat. The outline is the
                  fixed one -- same topic in the same place every time,
                  simplest first. Condition asks the other question:
                  what needs tending, worst first. */}
              <button
                type="button"
                className={styles.sortButton}
                aria-pressed={sort === 'outline'}
                onClick={() => setSort('outline')}
              >
                outline
              </button>
              {' · '}
              <button
                type="button"
                className={styles.sortButton}
                aria-pressed={sort === 'condition'}
                onClick={() => setSort('condition')}
              >
                condition
              </button>
              {'  ·  '}
              {/* A mode, not a sort: it turns the row's edit controls on
                  rather than reordering the bed. Set apart from the two
                  readings by weight so it does not read as a third one. */}
              <button
                type="button"
                className={styles.editToggle}
                aria-pressed={editing}
                onClick={() => setEditing(e => !e)}
              >
                {editing ? 'Done' : 'Edit'}
              </button>
              {/* Grouping is the outline's second axis, so it is offered
                  beside that reading and only where there is enough bed
                  to have a shape. Kept inside Edit with the rest of the
                  arranging: it rewrites the boxes, which is not
                  something to have within reach of a reader who came to
                  read the bed rather than to change it. */}
              {editing && sort === 'outline' && count >= 3 && (
                <>
                  {'  ·  '}
                  <button
                    type="button"
                    className={styles.editToggle}
                    onClick={proposeGroups}
                    disabled={grouping}
                  >
                    {grouping ? grouped : groups.length > 0 ? 'Group again' : 'Group these'}
                  </button>
                </>
              )}
            </>
          )}
        </span>
      </div>

      {tree.length === 0 ? (
        <div className={styles.bare}>
          <p className={styles.empty}>
            Nothing filed under this subject yet — a sowing that runs out of
            time leaves the bed like this, and so does taking the last topic
            out of it.
          </p>
          <button
            type="button"
            className={styles.sowSubmit}
            onClick={layOut}
            disabled={laying}
          >
            {laying ? labour : 'Lay out the bed'}
          </button>
          <p className={styles.sowHint}>
            {sown
              ? 'Asks for the map again from what you already said when you sowed it — the answers under “How you sowed it”. Nothing is asked of you a second time.'
              : 'There is no record of how this one was sown, so the map would rest on the subject’s name alone.'}
          </p>
          <p className={styles.sowHint}>
            Or name a topic below and it will be sown here on its own.
          </p>
          {note && <p className={styles.sowNote}>{note}</p>}
          {error && <p className={styles.sowProblem}>{error}</p>}
        </div>
      ) : (
        sort === 'condition' ? (
        <ul className={styles.tree}>
          {byCondition(tree).map(node => (
            <TreeRow
              key={node.topic.id}
              node={node}
              depth={0}
              colour={colour}
              editing={editing}
              onRemove={remove}
              onGrub={grub}
            />
          ))}
        </ul>
        ) : (
          <div className={styles.bands}>
            {bands.map((band, i) => {
              const row = (node: TopicTreeNode) => (
                <TreeRow
                  key={node.topic.id}
                  node={node}
                  depth={0}
                  colour={colour}
                  editing={editing}
                  onRemove={remove}
                  onGrub={grub}
                  groups={groups}
                  onMoveTo={
                    editing
                      ? id => editGroups({ topicId: node.topic.id, into: id })
                      : undefined
                  }
                />
              )

              // The loose topics between two boxes. No frame and no
              // name: "the rest" is a claim about the bed nobody made.
              if (!band.group) {
                return (
                  <ul key={`loose-${i}`} className={styles.tree}>
                    {band.topics.map(row)}
                  </ul>
                )
              }

              const group = band.group
              const at = groups.findIndex(g => g.id === group.id)

              return (
                <section key={group.id} className={styles.band}>
                  <div className={styles.bandHead}>
                    {renaming?.id === group.id ? (
                      <input
                        className={styles.bandRename}
                        value={renaming.title}
                        autoFocus
                        onChange={e => setRenaming({ id: group.id, title: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Escape') setRenaming(null)
                          if (e.key === 'Enter' && renaming.title.trim()) {
                            const title = renaming.title.trim()
                            setRenaming(null)
                            editGroups({ groupId: group.id, title })
                          }
                        }}
                        onBlur={() => setRenaming(null)}
                        aria-label={`Rename ${group.title}`}
                      />
                    ) : (
                      <h3 className={styles.bandTitle}>{group.title}</h3>
                    )}
                    <span className={styles.bandCount}>
                      {band.topics.length}{' '}
                      {band.topics.length === 1 ? 'topic' : 'topics'}
                    </span>

                    {editing && (
                      <span className={styles.bandActions}>
                        <button
                          type="button"
                          className={styles.nudge}
                          disabled={at <= 0}
                          onClick={() =>
                            editGroups({ groupOrder: moveWithin(groups, group.id, 'up') })
                          }
                          aria-label={`Move ${group.title} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.nudge}
                          disabled={at === -1 || at >= groups.length - 1}
                          onClick={() =>
                            editGroups({ groupOrder: moveWithin(groups, group.id, 'down') })
                          }
                          aria-label={`Move ${group.title} down`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => setRenaming({ id: group.id, title: group.title })}
                        >
                          Rename
                        </button>
                        {/* Deleting a box is not deleting anything in
                            it, so this never asks twice the way grubbing
                            a topic out does. */}
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => removeGroup(group)}
                          aria-label={`Remove the group ${group.title}`}
                        >
                          Remove group
                        </button>
                      </span>
                    )}
                  </div>

                  {band.topics.length === 0 ? (
                    <p className={styles.bandEmpty}>
                      Nothing in here yet — move a topic in with its “Move to”.
                    </p>
                  ) : (
                    <ul className={styles.tree}>{band.topics.map(row)}</ul>
                  )}
                </section>
              )
            })}

            {editing && (
              <div className={styles.newGroup}>
                {naming ? (
                  <>
                    <input
                      className={styles.bandRename}
                      value={newGroup}
                      autoFocus
                      placeholder="What is this group about?"
                      onChange={e => setNewGroup(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setNaming(false)
                          setNewGroup('')
                        }
                        if (e.key === 'Enter' && newGroup.trim()) {
                          const title = newGroup.trim()
                          setNaming(false)
                          setNewGroup('')
                          editGroups({ create: title }, `"${title}" is ready for topics.`)
                        }
                      }}
                      aria-label="Name the new group"
                    />
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => {
                        setNaming(false)
                        setNewGroup('')
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => setNaming(true)}
                  >
                    New group
                  </button>
                )}
              </div>
            )}
          </div>
        )
      )}

      {count > 1 && (
        <div className={styles.draw}>
          <button
            type="button"
            className={styles.sowSubmit}
            onClick={draw}
            disabled={drawing}
          >
            {drawing ? drawn : 'Draw connections'}
          </button>
          <p className={styles.sowHint}>
            {related === 0
              ? 'Nothing here leads to anything yet, so the outline is flat and the graph can only scatter it. This asks what follows what across the whole bed, and what it attaches to elsewhere on the map.'
              : `${related} ${related === 1 ? 'connection' : 'connections'} drawn so far. Asking again looks for what was missed; anything already drawn is left as it is.`}
          </p>
          {note && <p className={styles.sowNote}>{note}</p>}
          {error && <p className={styles.sowProblem}>{error}</p>}
        </div>
      )}

      <div className={styles.sow}>
        <label className={styles.sowLabel} htmlFor="new-topic">
          Add a topic
        </label>
        <div className={styles.sowRow}>
          <input
            id="new-topic"
            className={styles.sowInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && add()}
            placeholder="Row level security"
          />
          <button
            type="button"
            className={styles.sowSubmit}
            onClick={add}
            disabled={!title.trim() || busy}
          >
            {busy ? 'Sowing…' : 'Sow it'}
          </button>
        </div>
        <p className={styles.sowHint}>
          A name close to something already on the map files that topic here
          rather than growing a second copy of it.
        </p>
        {note && <p className={styles.sowNote}>{note}</p>}
        {error && <p className={styles.sowProblem}>{error}</p>}
      </div>
    </section>
  )
}

function countTopics(nodes: TopicTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTopics(n.children), 0)
}

/**
 * The bed flattened and ordered by what needs tending first.
 *
 * Nesting cannot survive this: a topic's parent has no claim to being
 * more urgent than the topic itself, so keeping the outline would
 * scatter the ordering it is meant to show. Worst condition first, and
 * within one condition the weakest figure, because a topic you barely
 * hold is worth more of your attention than one you nearly do.
 */
function byCondition(tree: TopicTreeNode[]): TopicTreeNode[] {
  const flat: TopicTreeNode[] = []
  const walk = (nodes: TopicTreeNode[]) => {
    for (const n of nodes) {
      flat.push({ ...n, children: [] })
      walk(n.children)
    }
  }
  walk(tree)

  const rank = (n: TopicTreeNode) =>
    STOCK_ORDER.indexOf(stockState(n.topic.freshness, n.topic.last_exposure_at))

  return flat.sort((a, b) => {
    const condition = rank(a) - rank(b)
    if (condition !== 0) return condition
    const ability = a.topic.ability - b.topic.ability
    if (ability !== 0) return ability
    return a.topic.title.localeCompare(b.topic.title)
  })
}

function TreeRow({
  node,
  depth,
  colour,
  editing,
  onRemove,
  onGrub,
  groups = [],
  onMoveTo,
}: {
  node: TopicTreeNode
  depth: number
  colour: string
  editing: boolean
  onRemove: (topic: SubjectTopicRow) => void
  onGrub: (topic: SubjectTopicRow) => void
  /** The boxes this topic could be moved into. Empty under the
   *  condition sort, which has no boxes to move between. */
  groups?: TopicGroup[]
  /** Undefined where moving is not on offer, which is what keeps the
   *  control out of the condition sort and out of the read-only bed. */
  onMoveTo?: (groupId: string | null) => void
}) {
  // Asked per row rather than per sheet: the second press has to be
  // next to the name it destroys, or it is a confirmation of nothing in
  // particular.
  const [asked, setAsked] = useState(false)
  const { topic } = node
  const state = stockState(topic.freshness, topic.last_exposure_at)
  const vague = vagueFigure(topic.ability_confidence)
  const unread = topic.resources.filter(r => r.status === 'queued').length
  const hasDetail = topic.resources.length > 0 || topic.curricula.length > 0
  // The third channel, printed as a chip: whether there is a route
  // through this topic and how far it has been worked. The condition bar
  // to the right says how warm the topic is; this says how far the plan
  // has been followed.
  const route = routeProgress(topic.curricula)

  return (
    <li className={styles.branch} style={{ '--depth': depth } as React.CSSProperties}>
      <div className={styles.topicRow}>
        <div className={styles.topicBody}>
          <Link href={`/topics/${topic.id}`} className={styles.topicName}>
            {topic.title}
          </Link>
          {/* The decision itself is made in the inbox, which the label
              never said -- it read as a status, so there was nowhere to
              go and nothing to press. It is the way there now. */}
          {topic.state === 'pending' && (
            <Link href="/inbox" className={styles.pending}>
              awaiting your decision
            </Link>
          )}
          {/* The route channel as a printed stamp: loud and filled where
              a route is being worked, a quiet outline where there is none
              yet, so the bed's active rows read first. */}
          <span className={styles.route} data-route={route.state}>
            <span className={styles.routeLabel}>{ROUTE_LABEL[route.state]}</span>
            {route.total > 0 && route.state !== 'drafted' && (
              <span className={styles.routeCount}>
                {route.complete}/{route.total}
              </span>
            )}
            {route.state === 'drafted' && route.total > 0 && (
              <span className={styles.routeCount}>{route.total} lessons</span>
            )}
          </span>
          {(topic.resources.length > 0 || topic.alsoIn.length > 0) && (
            <p className={styles.topicMeta}>
              {topic.resources.length > 0 && (
                <>
                  {topic.resources.length}{' '}
                  {topic.resources.length === 1 ? 'resource' : 'resources'}
                  {unread > 0 && ` · ${unread} unread`}
                </>
              )}
              {topic.resources.length > 0 && topic.alsoIn.length > 0 && ' · '}
              {topic.alsoIn.length > 0 &&
                `also in ${topic.alsoIn.map(s => s.title).join(', ')}`}
            </p>
          )}
        </div>

        <div className={styles.topicFigures}>
          <span className={`${styles.topicFigure} ${vague ? styles.vague : ''}`}>
            {vague && <span className={styles.about}>about </span>}
            {viabilityFigure(topic.ability)}
          </span>
          <StockBar
            freshness={topic.freshness}
            lastExposureAt={topic.last_exposure_at}
            colour={colour}
            width={72}
            height={8}
          />
          <span className={styles.topicState}>{STOCK_LABEL[state]}</span>
        </div>

        {/* Two different acts that have always looked like one. Taking
            it out of the bed leaves the topic standing as loose stock;
            grubbing it out destroys it. They are worded apart and the
            destroying one asks twice. */}
        {editing && !asked && (
          <span className={styles.rowActions}>
            {/* Where this topic sits among the boxes. A select rather
                than a drag: it reaches every group at any length of bed,
                and it works from a keyboard and a phone without being
                made to. "Ungrouped" is one of the options because
                leaving a box is as ordinary as joining one. */}
            {onMoveTo && groups.length > 0 && (
              <select
                className={styles.moveTo}
                value={topic.group_id ?? ''}
                onChange={e => onMoveTo(e.target.value || null)}
                aria-label={`Move ${topic.title} to a group`}
              >
                <option value="">Ungrouped</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={styles.remove}
              onClick={() => onRemove(topic)}
              aria-label={`Take ${topic.title} out of this subject`}
            >
              Take out
            </button>
            <button
              type="button"
              className={styles.grubRow}
              onClick={() => setAsked(true)}
              aria-label={`Grub out ${topic.title}`}
            >
              Grub out
            </button>
          </span>
        )}

        {editing && asked && (
          <span className={styles.rowConfirm}>
            <span className={styles.rowConfirmNote}>
              {grubLine(topic)} This cannot be undone.
            </span>
            <button
              type="button"
              className={styles.remove}
              onClick={() => setAsked(false)}
            >
              Leave it
            </button>
            <button
              type="button"
              className={styles.grubRowGo}
              onClick={() => {
                setAsked(false)
                onGrub(topic)
              }}
            >
              Grub it out
            </button>
          </span>
        )}
      </div>

      {hasDetail && (
        <details className={styles.filed}>
          <summary className={styles.filedSummary}>What is filed here</summary>

          {topic.curricula.length > 0 && (
            <ul className={styles.filedList}>
              {topic.curricula.map(curriculum => (
                <li key={curriculum.id} className={styles.filedRow}>
                  <Link href={`/curriculum/${curriculum.id}`} className={styles.filedName}>
                    {curriculum.title}
                  </Link>
                  <span className={styles.leaders} aria-hidden="true" />
                  <span className={styles.filedMeta}>
                    {curriculum.complete}/{curriculum.total} worked
                    {curriculum.status !== 'active' && ` · ${curriculum.status}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {topic.curricula.some(c => c.lessons.length > 0) && (
            <ul className={styles.lessonList}>
              {topic.curricula
                .flatMap(c => c.lessons)
                .slice(0, 8)
                .map(lesson => (
                  <li key={lesson.id} className={styles.lessonRow}>
                    <Link href={`/lesson/${lesson.id}`} className={styles.lessonName}>
                      {lesson.title}
                    </Link>
                    <span className={styles.lessonState}>
                      {lesson.completed ? 'worked' : 'open'}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {topic.resources.length > 0 && (
            <ul className={styles.filedList}>
              {topic.resources.map(resource => (
                <li key={resource.id} className={styles.filedRow}>
                  <span className={styles.filedName}>
                    {resource.url ? (
                      <a href={resource.url} target="_blank" rel="noreferrer">
                        {resource.title}
                      </a>
                    ) : (
                      resource.title
                    )}
                  </span>
                  <span className={styles.leaders} aria-hidden="true" />
                  <span className={styles.filedMeta}>
                    {resource.kind} · {resource.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {node.children.length > 0 && (
        <ul className={styles.children}>
          {node.children.map(child => (
            <TreeRow
              key={child.topic.id}
              node={child}
              depth={depth + 1}
              colour={colour}
              editing={editing}
              onRemove={onRemove}
              onGrub={onGrub}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * What grubbing this row out would take, from what the bed already has.
 *
 * The bed carries resources and lessons per topic but not marks or
 * readings, and widening its query to print one sentence would be a
 * join across every row of every bed for a line nobody reads until they
 * are deleting something. What it can say, it says; the topic's own
 * sheet says the rest, including the reassuring half.
 */
function grubLine(topic: SubjectTopicRow): string {
  const lessons = topic.curricula.reduce((n, c) => n + c.total, 0)
  const { takes } = grubbingOut({
    subjects: [],
    sources: [],
    resources: topic.resources.length,
    lessons,
    marks: 0,
    exposures: 0,
  })

  if (takes.length === 0) {
    return `Takes “${topic.title}” off the map, with its reading log.`
  }
  return `Takes ${takes.join(', ')}, and its reading log.`
}
