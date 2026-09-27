'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'

const api = didactic()

/**
 * Asks, once, for a topic's shape to be read (`api/topics/[id]/shape`)
 * where it has not been. Draws nothing; when a reading lands, the sheet
 * is read again so the topic's size carries it.
 */
export function ReadShape({ topicId }: { topicId: string }) {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    void api.topics.shape(topicId).then(({ ok, body }) => {
      if (ok && body.changed) router.refresh()
    })
  }, [topicId, router])
  return null
}
