export type NodeState = 'active' | 'pending'
export type CreatedBy = 'ai' | 'user' | 'skeleton'
export type EdgeKind = 'prereq' | 'related' | 'specialises' | 'alternative'
export type ResourceKind = 'article' | 'pdf' | 'book' | 'note'
export type ResourceStatus = 'queued' | 'reading' | 'consumed' | 'abandoned'
export type ExposureSource = 'resource' | 'quiz' | 'agent' | 'manual'
export type ExposureDepth = 'skim' | 'read' | 'applied'

export interface Node {
  id: string
  user_id: string
  title: string
  slug: string
  summary: string | null
  embedding: number[] | null
  cluster_id: string | null
  ability: number
  ability_confidence: number
  last_exposure_at: string | null
  state: NodeState
  created_by: CreatedBy
  created_at: string
}

export interface Edge {
  id: string
  from_node: string
  to_node: string
  kind: EdgeKind
  weight: number
  created_by: CreatedBy
}

export interface Cluster {
  id: string
  title: string
  colour: string
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
  node_id: string
  source: ExposureSource
  source_id: string | null
  depth: ExposureDepth
  ability_delta: number
  reason: string
  created_at: string
}
