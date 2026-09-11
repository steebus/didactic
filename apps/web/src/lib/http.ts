/**
 * Reading a response that might not be JSON.
 *
 * A request that runs past a platform's function timeout comes back as
 * an empty body or a gateway's HTML, and `res.json()` on that throws
 * "Unexpected end of JSON input" — which is what the user sees instead
 * of anything about what actually happened. This turns every one of
 * those into a sentence naming the real problem.
 */
export async function readJson<T = Record<string, unknown>>(
  res: Response
): Promise<{ ok: boolean; status: number; body: T; error: string | null }> {
  const text = await res.text().catch(() => '')

  let body: T | null = null
  if (text.trim()) {
    try {
      body = JSON.parse(text) as T
    } catch {
      body = null
    }
  }

  if (body !== null) {
    const stated = (body as { error?: unknown }).error
    return {
      ok: res.ok,
      status: res.status,
      body,
      error: res.ok ? null : typeof stated === 'string' ? stated : `Failed with ${res.status}.`,
    }
  }

  // No usable body. The status is all there is to go on, so it is
  // translated rather than reprinted.
  return {
    ok: false,
    status: res.status,
    body: {} as T,
    error: describe(res.status, text),
  }
}

function describe(status: number, text: string): string {
  if (status === 504 || status === 408) {
    return 'It took too long and the server gave up. Fewer topics, or try again — anything already filed is still filed.'
  }
  if (status === 502 || status === 503) {
    return 'The server did not answer. Try again in a moment.'
  }
  if (status === 401) return 'You are not signed in any more. Open the door again.'
  if (status === 413) return 'That was too large to send.'
  if (status === 0 || !status) return 'The connection dropped before an answer came back.'
  // An empty 200 is the timeout case on most platforms: the function
  // was killed after the response began.
  if (status === 200) {
    return 'The answer came back empty, which usually means it ran out of time. Try again.'
  }
  return `Failed with ${status}.${text.trim() ? ' The server said something that was not JSON.' : ''}`
}
