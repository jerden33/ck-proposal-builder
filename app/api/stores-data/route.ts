import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from('proposal-assets')
      .download('stores/stores-data.json')

    if (data && !error) {
      const text = await data.text()
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        },
      })
    }
  } catch {
    // Fall through to static bundled file
  }

  const filePath = join(process.cwd(), 'public', 'stores-data.json')
  const content = readFileSync(filePath, 'utf8')
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  })
}
