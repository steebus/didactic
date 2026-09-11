/**
 * What both front ends read.
 *
 * Nothing in here may import `next`, `react`, a DOM global or a live
 * Supabase client: the ESLint rule beside this file enforces it, because
 * the drift is otherwise silent and one-way -- the web keeps working and
 * the phone cannot import the file at all.
 *
 * Where a module has a pure half and a writing half, only the pure half
 * is here; the writer stays in `apps/web` and re-exports this one, so a
 * caller still has a single import.
 *
 * Modules are also importable directly (`@didactic/core/scoring`) for
 * the places that want one thing and not the barrel.
 */

export * from './types'
export * from './shapes'
export * from './config'
export * from './tags'
export * from './http'
export * from './markAnchor'
export * from './blocks'
export * from './books'
export * from './marks'
export * from './sections'
export * from './scoring'
export * from './curriculum'
export * from './subject'
export * from './outline'
export * from './progress'
export * from './lessonState'
export * from './answers'
export * from './expression'
export * from './model'
export * from './stock'
export * from './specimens'
export * from './graph'
export * from './copy'
export * from './similarity'
export * from './mentions'
export * from './mentionSearch'
export * from './lessonLinks'
export * from './graphMarks'
