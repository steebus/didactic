import type { Api, Result } from './client'
import type {
  ExposureDepth,
  Resource,
  ResourceKind,
  ResourceStatus,
} from '@didactic/core/types'

export interface AddResource {
  kind: ResourceKind
  url?: string
  title?: string
  text?: string
  topicId?: string
  /** Filed as already read. Filing is never an exposure on its own —
   *  the consumed transition is what writes one. */
  consumed?: boolean
}

/**
 * What filing something answers with.
 *
 * `warning` comes back with a 202: it saved, but the queue refused it,
 * which is worth saying since nothing will read it until that is fixed.
 * `alreadyFiled` says the link was already in the library rather than
 * filed twice.
 */
export interface Filed {
  id: string
  title: string
  warning?: string
  alreadyFiled?: boolean
  filedHereToo?: boolean
  /**
   * What a document turned out to be shaped like, read on the upload
   * itself so the sowing sheet can say what it found before anyone
   * chooses how closely to follow it. Null where it could not be read;
   * absent on every route but `uploaded`.
   */
  outline?: { chapters: number; source: string; pageCount: number } | null
}

export const resources = (api: Api) => ({
  list: () => api.get<{ resources: Resource[] }>('/api/resources'),
  add: (body: AddResource) => api.post<Filed>('/api/resources', body),

  /**
   * The one multipart route. `consumed` marks a PDF as evidence of
   * something already done rather than an item on the reading list.
   *
   * Kept because a phone runs the build it has, and an older one still
   * calls this. It can only carry a small file — the platform refuses a
   * request body over four and a half megabytes before the handler runs
   * — so anything that might be a book goes through `uploadDocument`
   * below instead.
   */
  upload: (file: File | Blob, consumed = false) => {
    const form = new FormData()
    form.append('file', file)
    if (consumed) form.append('consumed', 'true')
    return api.upload<Filed>('/api/resources/upload', form)
  },

  /** Permission to put a document straight into the bucket. */
  uploadUrl: (body: { filename: string; size: number; contentType?: string }) =>
    api.post<{ path: string; token: string; signedUrl: string }>(
      '/api/resources/upload-url',
      body
    ),

  /** The bytes have landed at `path`; file them. */
  uploaded: (body: { path: string; filename: string; consumed?: boolean }) =>
    api.post<Filed>('/api/resources/uploaded', body),

  /**
   * File a document of any size: sign, PUT, then tell the API.
   *
   * Three steps rather than one because the middle one must not go
   * through a function. Composed here so neither front end has to know
   * that, and so both do it the same way.
   *
   * The PUT is a plain `fetch` rather than supabase-js, because the
   * signed URL is the whole credential — there is no session to carry
   * and no client to construct, and the phone would otherwise need one
   * here for this alone.
   */
  uploadDocument: async (
    file: File,
    { consumed = false }: { consumed?: boolean } = {}
  ): Promise<Result<Filed>> => {
    const signed = await api.post<{ path: string; token: string; signedUrl: string }>(
      '/api/resources/upload-url',
      { filename: file.name, size: file.size, contentType: file.type }
    )
    if (!signed.ok) return signed as unknown as Result<Filed>

    try {
      const put = await fetch(signed.body.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/pdf' },
        body: file,
      })
      if (!put.ok) {
        return {
          ok: false,
          status: put.status,
          body: {} as Filed,
          error: `The upload did not finish (${put.status}).`,
        }
      }
    } catch {
      return {
        ok: false,
        status: 0,
        body: {} as Filed,
        error: 'The connection dropped during the upload.',
      }
    }

    return api.post<Filed>('/api/resources/uploaded', {
      path: signed.body.path,
      filename: file.name,
      consumed,
    })
  },

  /** The consumed transition is what writes the exposure. */
  patch: (id: string, body: { status?: ResourceStatus; depth?: ExposureDepth }) =>
    api.patch<{ ok: true }>(`/api/resources/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/resources/${id}`),

  /** Moves exposures; cannot be undone. */
  merge: (id: string, mergeId: string) =>
    api.post<{ ok: true }>(`/api/resources/${id}/merge`, { mergeId }),
})
