import { readJson } from '@didactic/core/http'

/**
 * One typed function per route, for two clients that prove themselves
 * differently.
 *
 * The web sends cookies and the phone sends a bearer token, so the only
 * thing that varies between them is a header and a base URL. Everything
 * else — the paths, the bodies, the shapes that come back, the sentence
 * a failure is described with — is the same on both, and is here so it
 * cannot be the same twice.
 *
 * Nothing throws on an HTTP error. `readJson` already turns a timeout,
 * a gateway's HTML and an empty body into a sentence the user can be
 * shown, and a client that threw would make every caller reinvent that.
 */

/** What every call answers with: `readJson`'s shape, named. */
export interface Result<T> {
  ok: boolean
  status: number
  body: T
  error: string | null
}

export interface ApiOptions {
  /** Where the API lives. Empty on the web, where paths are relative. */
  baseUrl?: string
  /**
   * Headers for a request, asked for each time rather than held.
   *
   * A phone's access token expires while the app is open, so a header
   * captured once would go stale mid-session. Asking per request lets
   * the caller hand back a fresh one — supabase-js refreshes its own
   * token, and this reads whatever it holds now.
   */
  headers?: () => Promise<Record<string, string>> | Record<string, string>
}

export interface Api {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<Result<T>>
  post<T>(path: string, body?: unknown): Promise<Result<T>>
  patch<T>(path: string, body?: unknown): Promise<Result<T>>
  del<T>(path: string, body?: unknown): Promise<Result<T>>
  /** Multipart, for the one route that takes a file. */
  upload<T>(path: string, form: FormData): Promise<Result<T>>
}

export function createApi({ baseUrl = '', headers }: ApiOptions = {}): Api {
  async function send<T>(
    method: string,
    path: string,
    init: { body?: FormData; json?: unknown; query?: Record<string, string | number | undefined> } = {}
  ): Promise<Result<T>> {
    const url = new URL(`${baseUrl}${path}`, baseUrl || 'http://localhost')
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }

    const supplied = (await headers?.()) ?? {}
    const sent: Record<string, string> = { ...supplied }
    // FormData sets its own multipart boundary; naming a content type
    // here would replace it with one that has none, and the server
    // would read the parts as a single unparseable blob.
    if (init.json !== undefined) sent['Content-Type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(baseUrl ? url.toString() : `${url.pathname}${url.search}`, {
        method,
        headers: sent,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
        // The web's session is a cookie, and a cross-origin fetch drops
        // cookies unless asked. The phone sends a header and is
        // unaffected either way.
        credentials: 'include',
      })
    } catch {
      // A dropped connection never reaches `readJson`, so it is given
      // the same shape here rather than thrown at the caller.
      return {
        ok: false,
        status: 0,
        body: {} as T,
        error: 'The connection dropped before an answer came back.',
      }
    }

    return readJson<T>(res) as Promise<Result<T>>
  }

  return {
    get: (path, query) => send('GET', path, { query }),
    post: (path, body) => send('POST', path, { json: body ?? {} }),
    patch: (path, body) => send('PATCH', path, { json: body ?? {} }),
    del: (path, body) => send('DELETE', path, { json: body ?? {} }),
    upload: (path, form) => send('POST', path, { body: form }),
  }
}
