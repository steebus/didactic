import { NextResponse } from 'next/server'
import { getPlanting } from '@/lib/planting'

export async function GET() {
  // The query itself is `getPlanting`, shared with `/api/graph`: two
  // copies of it would drift the moment one grew a column.
  return NextResponse.json(await getPlanting())
}
