/** Every row of a table, a page at a time. PostgREST answers at most
 *  a thousand rows a request, and a reading that silently lost the
 *  thousand-and-first link would be a reading of a different map. */
export async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < size) return { data: out, error: null }
  }
}
