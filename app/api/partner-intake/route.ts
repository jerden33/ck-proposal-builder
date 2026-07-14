import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const NOTIFY_EMAIL = process.env.PARTNER_INTAKE_NOTIFY_EMAIL || 'jordan.henderson@circlek.com'
const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.pdf']
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days
const BUCKET = 'partner-uploads'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-.\s]{7,20}$/

function sanitizeText(value: string): string {
  // Strip control characters and angle brackets; collapse whitespace.
  return value
    .replace(/[\x00-\x1F\x7F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function sanitizeNotes(value: string): string {
  // Same control-character/angle-bracket stripping as sanitizeText, but
  // preserves newlines and allows a much longer, optional free-text value.
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F<>]/g, '')
    .trim()
    .slice(0, 2000)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'company'
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  if (isRateLimited(`partner-intake:${ip}`)) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form submission.' }, { status: 400 })
  }

  const rawFields = {
    submitterName: formData.get('submitterName'),
    submitterEmail: formData.get('submitterEmail'),
    companyName: formData.get('companyName'),
    hqLocation: formData.get('hqLocation'),
    contactName: formData.get('contactName'),
    title: formData.get('title'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    fleetSize: formData.get('fleetSize'),
    notes: formData.get('notes'),
  }
  const file = formData.get('file')

  if (
    typeof rawFields.submitterName !== 'string' ||
    typeof rawFields.submitterEmail !== 'string' ||
    typeof rawFields.companyName !== 'string' ||
    typeof rawFields.hqLocation !== 'string' ||
    typeof rawFields.contactName !== 'string' ||
    typeof rawFields.title !== 'string' ||
    typeof rawFields.email !== 'string' ||
    typeof rawFields.phone !== 'string' ||
    typeof rawFields.fleetSize !== 'string'
  ) {
    return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 })
  }

  const submitterName = sanitizeText(rawFields.submitterName)
  const submitterEmail = sanitizeText(rawFields.submitterEmail)
  const companyName = sanitizeText(rawFields.companyName)
  const hqLocation = sanitizeText(rawFields.hqLocation)
  const contactName = sanitizeText(rawFields.contactName)
  const title = sanitizeText(rawFields.title)
  const email = sanitizeText(rawFields.email)
  const phone = sanitizeText(rawFields.phone)
  const fleetSize = Number(rawFields.fleetSize)
  const notes = typeof rawFields.notes === 'string' ? sanitizeNotes(rawFields.notes) : ''

  if (!submitterName || !submitterEmail || !companyName || !hqLocation || !contactName || !title || !email || !phone) {
    return NextResponse.json({ success: false, error: 'All fields are required.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(submitterEmail)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  if (!Number.isInteger(fleetSize) || fleetSize < 1 || fleetSize > 100000) {
    return NextResponse.json({ success: false, error: 'Fleet size must be a whole number between 1 and 100,000.' }, { status: 400 })
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Please attach your 90-day transaction report.' }, { status: 400 })
  }
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json(
      { success: false, error: 'Unsupported file type. Please upload a .csv, .xlsx, .xls, or .pdf file.' },
      { status: 400 }
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'File is too large. Maximum size is 25MB.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const timestamp = Date.now()
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-150)
  const storagePath = `${slugify(companyName)}-${timestamp}/${safeFileName}`

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    console.error('Partner intake upload error:', uploadError)
    return NextResponse.json({ success: false, error: 'Failed to upload file. Please try again.' }, { status: 500 })
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

  if (signedUrlError || !signedUrlData) {
    console.error('Partner intake signed URL error:', signedUrlError)
    return NextResponse.json({ success: false, error: 'Failed to process file. Please try again.' }, { status: 500 })
  }

  const submittedAt = new Date()
  const signedUrlExpiresAt = new Date(submittedAt.getTime() + SIGNED_URL_EXPIRY_SECONDS * 1000)

  const { error: insertError } = await supabase.from('partner_intake_submissions').insert({
    submitter_name: submitterName,
    submitter_email: submitterEmail,
    company_name: companyName,
    hq_location: hqLocation,
    contact_name: contactName,
    title,
    email,
    phone,
    fleet_size: fleetSize,
    notes,
    file_path: storagePath,
    file_name: safeFileName,
    file_size: file.size,
    signed_url_expires_at: signedUrlExpiresAt.toISOString(),
    submitted_ip: ip,
  })

  if (insertError) {
    console.error('Partner intake insert error:', insertError)
    // Continue — the file is already uploaded; still try to notify by email
    // so the submission isn't silently lost.
  }

  let emailSent = false
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: process.env.PARTNER_INTAKE_FROM_EMAIL || 'Fleet Insights <onboarding@resend.dev>',
      to: NOTIFY_EMAIL,
      subject: `New Fleet Partner Intake: ${companyName}`,
      html: `
        <h2>New Fleet Partner Intake Submission</h2>
        <table cellpadding="6" cellspacing="0" border="0">
          <tr><td><strong>Submitted By</strong></td><td>${escapeHtml(submitterName)} (${escapeHtml(submitterEmail)})</td></tr>
          <tr><td><strong>Company Name</strong></td><td>${escapeHtml(companyName)}</td></tr>
          <tr><td><strong>HQ Location</strong></td><td>${escapeHtml(hqLocation)}</td></tr>
          <tr><td><strong>Contact Name</strong></td><td>${escapeHtml(contactName)}</td></tr>
          <tr><td><strong>Title</strong></td><td>${escapeHtml(title)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${escapeHtml(phone)}</td></tr>
          <tr><td><strong>Fleet Size</strong></td><td>${fleetSize.toLocaleString()}</td></tr>
          <tr><td><strong>Submitted</strong></td><td>${submittedAt.toISOString()}</td></tr>
        </table>
        ${notes ? `<p><strong>Notes:</strong><br />${escapeHtml(notes).replace(/\n/g, '<br />')}</p>` : ''}
        <p>
          <strong>90-Day Transaction Report:</strong><br />
          <a href="${signedUrlData.signedUrl}">${escapeHtml(safeFileName)}</a>
          (link expires ${signedUrlExpiresAt.toISOString()})
        </p>
      `,
    })
    emailSent = !result.error
    if (result.error) console.error('Partner intake email error:', result.error)
  } catch (err) {
    console.error('Partner intake email exception:', err)
  }

  if (emailSent && !insertError) {
    await supabase
      .from('partner_intake_submissions')
      .update({ email_sent: true })
      .eq('file_path', storagePath)
  }

  return NextResponse.json({ success: true })
}
