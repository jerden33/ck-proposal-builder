import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const PROPOSALS_DIR = path.join(process.cwd(), 'data', 'proposals')

// Generate a unique ID for proposals
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Ensure the proposals directory exists
async function ensureDir() {
  if (!existsSync(PROPOSALS_DIR)) {
    await mkdir(PROPOSALS_DIR, { recursive: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const id = generateId()

    await ensureDir()
    const filePath = path.join(PROPOSALS_DIR, `${id}.json`)
    await writeFile(filePath, JSON.stringify(data, null, 2))

    return NextResponse.json({ id, url: `/proposal/${id}` })
  } catch (error) {
    console.error('Error saving proposal:', error)
    return NextResponse.json({ error: 'Failed to save proposal' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing proposal ID' }, { status: 400 })
    }

    const filePath = path.join(PROPOSALS_DIR, `${id}.json`)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    const data = await readFile(filePath, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch (error) {
    console.error('Error loading proposal:', error)
    return NextResponse.json({ error: 'Failed to load proposal' }, { status: 500 })
  }
}
