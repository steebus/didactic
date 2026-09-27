# Didactic: an overview for an agent thinking about the product

You are being brought in to think about ideas for Didactic: what it could
do next, what is missing, what could work better. This document gives you
the whole picture: what the app is for, its fixed principles, the vocabulary
it uses, how data moves through it, what is built, and where the known
tensions are. Read it as ground truth about the current app (September
2026). Where it and your intuition disagree, it is right about what exists.
You are free to argue it should change.

---

## 1. The product in brief

Didactic is a **living map of what one person is learning**. They learn
widely: web and app development, databases, infrastructure, AI, and
non-technical subjects such as economic history and photography. They read
articles and books, work through PDFs, build things, and pick things up at
work.

The map should answer, at a glance: **which areas are being fed, which have
gone cold, and where material has been stockpiled but never read.** Success
is the weekly return: opening the app after a week away, seeing the shape of
recent attention, and acting on a cold area in one press.

It has **one user**. There are no accounts to share, no teams and no social
features. It is used in two ways:

- **Desk, deep.** Exploring the graph, reading lessons and saved material in
  the app, planning where to go next.
- **Phone, incidental.** Sending a link to the inbox mid-read, marking
  something as read, glancing at the map. The web app works on a phone now; a
  native phone app is planned and not yet built.

**Position.** Read-later tools store what you meant to read. Note tools
store what you wrote. Spaced-repetition tools drill what you chose to
memorise. None of them shows the shape of your attention across subjects
over time. Didactic does, and it separates what you have been *exposed to*
from what you can *do*.

## 2. Principles that are fixed

Ideas that break these will be rejected, however clever. Ideas that serve
them are wanted.

1. **The map is the product.** Every feature makes the map more accurate,
   more legible or more actionable. Anything that does none of those waits.
2. **Honest over flattering.** A small, cold, accurate map beats a large,
   warm, aspirational one. Filing is not reading; reading is not
   understanding.
3. **Every number explains itself.** A figure the reader cannot interrogate
   is one they stop trusting. Each topic's figure lists the evidence behind
   it.
4. **Vagueness is visible where confidence is low.** A figure resting on
   little evidence prints as "about 40%", in italic, faded, with a caveat. It
   never looks precise.
5. **The user always wins over the AI.** Anything generated (topics,
   subjects, routes, lessons, filings) is a proposal the user can rename,
   merge, split or delete.

And the mechanisms that follow from them:

- **Saving is intent; reading is evidence.** Adding material records
  nothing about learning. Only saying it was read, and how deeply, does.
- **Ability belongs to the app.** Each topic has an ability from 1 to 5 with
  a confidence. The user cannot set or override it; a wrong figure is fixed by
  feeding real evidence. It is a cache over an append-only exposure log, so
  every figure can be rebuilt and explained.
- **Reading alone cannot make an expert.** Ability from reading is capped at
  3.5 of 5. Going higher takes applied work: saying a whole reading back in
  your own words, doing, or evidence from checks and conversation.
- **A merge cannot be undone, so the app asks rather than guesses.** When a
  new concept might be one already on the map, the user decides. A wrong
  merge destroys history; a wrong split costs one press.
- **The sheet may raise a question but never settle one for you.** Advice
  on screen names what it sees ("a bare name against a topic with history")
  and never says "merge them".

## 3. Vocabulary

The app speaks the language of a **grower's seed catalogue**: beds, sowing,
roots, stock, sprouting, grubbing out. The terms below are the real names
used on screen and in code.

| Term | Meaning |
| --- | --- |
| **Subject** (a *bed*) | A field being learned: "Photography", "Front-end development". Holds topics. Has its own colour (a *plate*). |
| **Topic** | A learnable concept: "React Hooks", "Aperture", "Keynesianism". Belongs to every subject it genuinely sits under (many-to-many), or to none. |
| **Loose stock** | Topics filed under no subject. They have their own sheet, which says where each looks like it belongs. |
| **Resource** (*material*) | A saved link, note, book (looked up through Open Library) or PDF. Filed under the topics it is about. Status: *unread*, *reading*, *read*, *set aside*. |
| **Exposure** | One entry in the append-only record of learning: a topic, a depth, a weight, a reason and a source. Everything that moves a figure writes one. |
| **Depth** | How deep an exposure went. Weights: struggled 0, marked 0.01, answered 0.05, skimmed 0.2, read 0.5, applied 1.0. |
| **Ability** | 1–5, computed from exposures, with a **confidence**. Printed as a **viability** percentage; below 0.4 confidence it prints as "about …". |
| **Freshness** | Decay since the last exposure, with a 90-day half-life. Computed when read. Drives "gone cold". |
| **Sowing** | Creating a subject. The reader states their depth (**roots**, 0–5), what has taken, how far they want to go, and optional proof. A model lays out the bed and asks 5–10 qualifying questions, which are marked to give a second, independent figure. |
| **Curriculum** (a *route*) | A plan of lessons for one topic, drafted with the agent and approved by the user. A draft counts for nothing. |
| **Lesson** | A written lesson in a route. Rich blocks: chart, model, check, blank, sort, compare, steps, flow, picture, and mathematics. Completing one is an exposure at a stated depth. Can be listened to. |
| **Refresher** | A short written reminder of a topic, generated on demand. |
| **Mark** | A kept passage from a lesson or resource, with an optional note. Notes can name topics or lessons with `@`. Shown on the *Marked* sheet as a botanical plate. |
| **Summary** | The reader's own words: of one section (a light mark) or of a whole reading (applied work). |
| **Diary entry** | A page about a week: what is sticking, what is not. A model reads it back for what it shows about each topic it names; the reader can take back anything it claimed. |
| **Cloze / card / the garden / tending** | Spaced repetition (FSRS). Cards are the lesson's own sentences with the key words removed, never a deck anyone builds. *Tend* is the review sheet. |
| **Adjudication queue** | Topics that might duplicate one already on the map, waiting for the reader: *Keep separate*, *Same as …* (merge), or *Discard*. |
| **Fertile ground** | Read material whose topics matched no subject already sown: a proposal to sow one. |
| **Sprouting subjects** | Subjects nobody sowed, found by clustering how topics are tied together with the existing subjects taken out. Offered to be planted or dismissed. |
| **Grub out / promote / demote** | Delete a topic or subject; make a topic into a subject; fold a topic into another's route as a lesson. |
| **The bench** | Background work (sowing, writing a lesson) reported from the corner of every page, so the reader can walk away while it runs. |
| **Ask** | A conversation with an agent that already knows what is on screen. It can write marks and cards (with undo). It can only *propose* topics, which wait for a tap. It can fold a discussion into the lesson as a new section. |

## 4. The data model

```
subject ──< topic_subjects >── topic ──< resource_topics >── resource
                                 │                               │
                                 ├──< exposures  (append-only)   ├── resource_bodies (the readable text)
                                 ├──< edges >── topic            ├── resource_passages (a PDF, cut up)
                                 ├──< curricula ──< lessons      └── resource.filing (whole / parts)
                                 ├──< highlights (marks, summaries, diary)
                                 └──< cloze_concepts ──< clozes ──< cloze_reviews
```

- A topic has a title, a description, a state (**active** or **pending**), who
  made it (**ai**, **user**), a title embedding, a kinship embedding (title
  plus description), ability, confidence and last exposure.
- An **edge** says how two topics relate: prerequisite, specialises,
  related or alternative. A model or the reader can draw one.
- Subject membership keeps the order a bed was sown in.
- Evidence always goes through `exposures`. Nothing writes ability directly.

## 5. How things move

### Material in

1. A link, note, book or PDF is saved. It is queued; nothing is learned yet.
2. **Ingestion** gets the text. For a link it keeps the page's readable
   body, so it can be read in the app. A PDF is read in rounds into citable
   passages.
3. A model extracts the **concepts**, each with a general description. If
   the piece is a focused treatment of one thing (a tutorial on Bloom
   filters, say), it is filed as that one topic instead. The reader can also
   say so, or insist on the parts.
4. For each concept, **embeddings nominate** the 25 nearest topics. A
   separate **evaluation model** reads the descriptions and returns a
   probability that the concept is each one, or none. A clear winner, whose
   scope a second question confirms is the same size, **links**. A clear
   "none" **creates** a topic. Anything in between goes to the
   **adjudication queue**, recording which topic it was unsure about. If
   that reading fails, title similarity decides instead.
5. New topics are **filed** into subjects where the reading placed them,
   into the subjects their matches already sit in, or later by the graph
   itself once edges exist. A model proposes edges between new and existing
   topics.
6. The resource is now **filed**, not read.

### Learning recorded

- Marking material read asks how it went (skimmed, read, applied) and writes
  one exposure per topic it is filed under, scaled by relevance.
- Completing a lesson, keeping a mark, summarising, answering a lesson's
  check question, a diary entry read back, and sowing (your stated roots) all
  write exposures too.
- Ability and confidence are recomputed from the log. Freshness decays with
  time.

### Structure grown deliberately

- **Sowing** lays out a whole bed at once, in the order it should be met,
  and drafts a route and first lesson for the first topic, unasked.
- **Adding a topic by hand** places it in the bed with edges, after a model
  reads it against the subject.
- **Curricula** are drafted, reshaped and approved. Lessons are written on
  demand and can cite the reader's own documents.
- **Sprouting** reads four signals, with subjects removed: material that
  files topics together, marks joining them, the map's own edges, and
  similarity of meaning. It finds stable clusters (community detection
  agreed across many runs) and asks a model to name what each is.

### Structure corrected

- The adjudication queue, loose stock and filing claims, *Keep separate* /
  *Same as* / *Discard*, grub out, promote, demote, and re-filing a resource
  as one topic or by its parts.

## 6. The surfaces

| Sheet | What it is for |
| --- | --- |
| **Subjects** (home) | The stock list: every bed with its viability, freshness and state, fertile ground, and the way into sprouting. The glance. |
| **The bed** (graph) | Every topic as a node, placed by a force layout the reader can tune: spacing, draw together, link pull, subject pull, kinship pull. Subject outlines and sprouting outlines drawn over it. |
| **Subject bed** | One subject as a fixed outline: topics nested by what specialises or precedes what, with material, routes and lessons under each. |
| **Topic** | One topic's figure and the exposures behind it, its material, routes, lessons, marks, summaries and neighbours. |
| **Inbox** | Saving material; what is unread and read; the adjudication queue; search across everything. |
| **Resource** | Saved material read in the app, with marks, summaries, cards and *Have you read it?* at the foot. |
| **Curriculum / lesson** | Routes and lessons, with contents, marks, summaries, cards, listening and Ask. |
| **Marked** | Every mark, summary and diary entry as one dated stream, drawn as a botanical plate. |
| **Tend** | Spaced repetition, one card at a time. |
| **Loose stock** | Topics in no subject, in handfuls. |
| **Sprouting** | Proposed subjects, what holds each together, and what was looked at and set aside, with why. |
| **Sow a subject** | The form that creates a bed. |

## 7. The intelligence layer

- **Generative work** (extracting concepts, laying out beds, writing
  lessons and refreshers, drafting routes, proposing edges, naming sprouts,
  reading diary entries back, Ask) uses Claude through the Anthropic API.
- **Judging** (is this concept one already on the map, which subject does it
  belong under, is it the same size) uses a separate evaluation model. It
  returns probability distributions over typed options rather than
  self-reported confidence. Bars are set on those probabilities.
- **Embeddings** are gte-small (384 dimensions), from a Supabase edge
  function. They are good at nominating near neighbours and poor at deciding
  sameness. Titles within one field all sit close together.
- **Listening** is text-to-speech run on the owner's own machine, which
  polls for work. Nothing calls it.
- **Cost and time matter.** The web host allows about a minute per request,
  so long work is split up, queued or reported from the bench.

## 8. Look and feel

A grower's seed catalogue, printed on paper: warm paper grounds, dark ink,
five plate inks (green, terracotta, mustard, ultramarine, plum) plus olive,
Fraunces for display and figures, Archivo for text. Square corners, hairline
rules, paper texture, a botanical specimen per subject that grows with
depth. A dark mode exists.

State is **never colour alone**. Freshness is also hatching density, a word
and a label. A self-reported level is a specimen that grows. Low confidence
changes how a figure is set. Numbers use tabular figures and explain
themselves on request.

## 9. Architecture, as it bears on ideas

- Web: Next.js on Vercel. A phone app (Expo) is planned and shares the same
  API and the same logic package, so the two cannot print different
  numbers.
- Backend: Supabase (Postgres, pgvector, auth, storage, a job queue).
  Migrations are applied when merged, so a schema change is a deployment.
- The API may gain fields but not lose or rename them, because an old phone
  build keeps running.
- Single owner. Every table is protected by row-level security.

## 10. What exists and what does not

**Built on the web:** everything in §6, plus: saving links, notes, books
and PDFs; ingestion; the reader for material and lessons; marks with notes
and `@` tags; summaries; the diary and its read-back; spaced repetition;
routes and lessons with interactive blocks; listening; Ask; sowing with
qualifying questions; sprouting; the graph with tunable forces; search;
dark mode.

**Not built:**

- the native phone app;
- a settings sheet;
- sharing a link into the app from another app (share target);
- realtime updates;
- "blindspot" suggestions (named as a later phase).

Quizzing exists only as check blocks inside lessons: a right answer writes a
small exposure. There is no standalone quiz.

## 11. Known tensions: good places to think

These came up while building and are unresolved or only partly resolved.

1. **Two kinds of sameness.** Title similarity is fast but unreliable:
   "Hash Functions" scores 0.83 against "JavaScript". The evaluation model
   decides well but costs a call. Saving material uses the model. Sowing and
   adding a topic by hand still judge by wording. Ask-proposed topics skip
   the check entirely.
2. **Granularity.** A topic can be too fine (every concept in a tutorial
   became a topic) or too coarse (one survey filed as one topic). Focus
   detection is new. What is the right grain for a personal map, and should
   it adapt to how deep the reader has gone?
3. **Evidence timing.** Marking material read before ingestion has filed it
   gives no credit, and none is added later. "Set aside" changes a label
   but material set aside still steers lessons and sprouting as if it were
   unread.
4. **Emergent versus declared structure.** Subjects are declared by sowing;
   sprouting proposes subjects from the data. How should declared and
   emergent structure coexist, and when should the map reorganise itself
   rather than ask?
5. **The cold area.** The promise is acting on a cold area in one press.
   Refreshers, routes and tending exist. What is the single best press, and
   how does the app choose which cold area deserves it?
6. **Ability beyond reading.** Reading caps at 3.5. Applied evidence
   currently comes from whole summaries, lessons worked at depth, checks and
   diary read-backs. What other honest evidence of ability could a
   single-user app gather without becoming a test?
7. **The phone.** Capture and glance are the phone's jobs. What should the
   phone do that the web cannot?
8. **Scale.** The map is meant to reach thousands of topics. The home sheet
   exists because a raw graph at that size cannot be glanced at. What else
   breaks at that size?

## 12. How to be most useful

- Say which principle an idea serves, and which surface it lives on.
- Say what evidence it writes, if any, and why that evidence is honest.
- Prefer ideas that make the map more accurate, legible or actionable over
  ideas that add activity.
- Anything generated must stay a proposal the user can undo or override.
- Streaks, badges or scores that rise without evidence run against
  principle 2. Numbers that cannot explain themselves run against principle
  3.
- It is fine to challenge a principle. Say so explicitly, and say what would
  be gained and lost.
- Ask for detail on any mechanism here rather than assuming.
