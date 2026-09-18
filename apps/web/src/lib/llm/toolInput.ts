/**
 * Reading a list out of a tool call.
 *
 * A tool's `input_schema` says a field is an array and the API usually
 * hands one back. Sometimes it hands back the JSON *text* of one
 * instead -- the whole object re-encoded as a string under the field
 * name -- and `Array.isArray` is false for that, so a caller that
 * checked the obvious way got an empty list and no error.
 *
 * That is the worst shape a failure can take here: the model answered
 * correctly, the answer was thrown away, and the route reported the
 * cheerful version of nothing happening. `Group these` returned "nothing
 * here groups cleanly" for a bed of twenty-seven topics that the model
 * had in fact divided into six.
 *
 * So the coercion lives in one place and every tool reader goes through
 * it. It is deliberately forgiving about *where* the list is and strict
 * about what comes out: unparseable text, or a shape with no list in it,
 * is an empty list, which is what the callers already treat as "the
 * model said nothing usable".
 */

/**
 * Pull `field` out of a tool's input as an array.
 *
 * Handles the three shapes seen in practice:
 *   - the array itself, which is the ordinary case;
 *   - a JSON string holding the array;
 *   - a JSON string holding the whole input object again, with the
 *     array under the same field name.
 */
export function toolList(input: unknown, field: string): unknown[] {
  if (!input || typeof input !== 'object') return []

  const value = (input as Record<string, unknown>)[field]
  if (Array.isArray(value)) return value

  if (typeof value !== 'string') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    // Not JSON at all. Nothing to recover, and guessing at the text
    // would be inventing an answer the model did not give.
    return []
  }

  if (Array.isArray(parsed)) return parsed

  // The re-encoded object case: the same field, one level in.
  if (parsed && typeof parsed === 'object') {
    const inner = (parsed as Record<string, unknown>)[field]
    if (Array.isArray(inner)) return inner
  }

  return []
}
