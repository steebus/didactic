export type TopicState = 'active' | 'pending'
export type CreatedBy = 'ai' | 'user' | 'skeleton'
export type EdgeKind = 'prereq' | 'related' | 'specialises' | 'alternative'
export type ResourceKind = 'article' | 'pdf' | 'book' | 'note'
export type ResourceStatus = 'queued' | 'reading' | 'consumed' | 'abandoned'
export type ExposureSource = 'resource' | 'quiz' | 'agent' | 'manual' | 'lesson'
export type ExposureDepth = 'skim' | 'read' | 'applied'
export type CurriculumShape = 'linear' | 'branching'
export type CurriculumStatus = 'draft' | 'active' | 'archived'
export type LessonStage = 'introductory' | 'core' | 'advanced'

/** The top layer. "Photography", "Front-end development". */
export interface Subject {
  id: string
  title: string
  colour: string
}

/**
 * An area within a subject, and a node on the graph. Topics under one
 * subject need not relate to each other -- portrait and landscape
 * photography are separate pursuits -- and one topic may sit under
 * several subjects, which is what `topic_subjects` records.
 */
export interface Topic {
  id: string
  user_id: string
  title: string
  slug: string
  summary: string | null
  embedding: number[] | null
  /** The topic's home subject: what the graph colours it by. */
  primary_subject_id: string | null
  ability: number
  ability_confidence: number
  last_exposure_at: string | null
  state: TopicState
  created_by: CreatedBy
  created_at: string
}

export interface Edge {
  id: string
  from_topic: string
  to_topic: string
  kind: EdgeKind
  weight: number
  created_by: CreatedBy
}

export interface Resource {
  id: string
  url: string | null
  title: string
  kind: ResourceKind
  status: ResourceStatus
  raw_text: string | null
  summary: string | null
  storage_path: string | null
  mime_type: string | null
  file_size: number | null
  added_at: string
  consumed_at: string | null
}

export interface Exposure {
  id: string
  topic_id: string
  source: ExposureSource
  source_id: string | null
  depth: ExposureDepth
  ability_delta: number
  reason: string
  created_at: string
}

/**
 * A route through one topic, introductory to advanced. Drafted with the
 * agent, approved by the user; `approved_at` is where the user's final
 * say is recorded.
 */
export interface Curriculum {
  id: string
  user_id: string
  topic_id: string
  title: string
  goal: string | null
  shape: CurriculumShape
  status: CurriculumStatus
  created_by: CreatedBy
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface Lesson {
  id: string
  user_id: string
  curriculum_id: string
  /** The concept taught. Null for scaffolding, which moves no ability. */
  topic_id: string | null
  title: string
  slug: string
  summary: string | null
  /** Written on demand; null until the lesson is first opened. */
  body: string | null
  position: number
  stage: LessonStage
  estimated_minutes: number | null
  created_by: CreatedBy
  completed_at: string | null
  created_at: string
}

export interface LessonPrereq {
  lesson_id: string
  requires_lesson_id: string
}
