/**
 * What both front ends read.
 *
 * Nothing in here may import `next`, `react`, a DOM global or a live
 * Supabase client: the ESLint rule beside this file enforces it, because
 * the drift is otherwise silent and one-way -- the web keeps working and
 * the phone cannot import the file at all.
 *
 * Modules are also importable directly (`@didactic/core/scoring`) for
 * the places that want one thing and not the barrel.
 */

export * from './types'
export * from './config'
export * from './tags'
export * from './http'
export * from './markAnchor'
export * from './blocks'
export * from './books'
export * from './marks'
export * from './sections'
