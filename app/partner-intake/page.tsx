'use client'

import { useState, useRef } from 'react'
import { Zap, AlertCircle, CheckCircle2, UploadCloud, FileText, X } from 'lucide-react'

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.pdf']
const MAX_FILE_SIZE = 25 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-.\s]{7,20}$/

interface FormState {
  submitterName: string
  submitterEmail: string
  companyName: string
  hqLocation: string
  contactName: string
  title: string
  email: string
  phone: string
  fleetSize: string
  notes: string
}

const initialState: FormState = {
  submitterName: '',
  submitterEmail: '',
  companyName: '',
  hqLocation: '',
  contactName: '',
  title: '',
  email: '',
  phone: '',
  fleetSize: '',
  notes: '',
}

function validateFile(file: File | null): string | null {
  if (!file) return 'Please attach your 90-day transaction report.'
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return 'Unsupported file type. Please upload a .csv, .xlsx, .xls, or .pdf file.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File is too large. Maximum size is 25MB.'
  }
  return null
}

export default function PartnerIntakePage() {
  const [form, setForm] = useState<FormState>(initialState)
  const [file, setFile] = useState<File | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState | 'file', string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, notes: e.target.value }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    const error = validateFile(selected)
    setFieldErrors((prev) => ({ ...prev, file: error ?? undefined }))
    setFile(error ? null : selected)
    if (error && fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearFile = () => {
    setFile(null)
    setFieldErrors((prev) => ({ ...prev, file: undefined }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState | 'file', string>> = {}

    if (!form.submitterName.trim()) errors.submitterName = 'Your name is required.'
    if (!form.submitterEmail.trim()) {
      errors.submitterEmail = 'Email address is required.'
    } else if (!EMAIL_RE.test(form.submitterEmail.trim())) {
      errors.submitterEmail = 'Please enter a valid email address.'
    }
    if (!form.companyName.trim()) errors.companyName = 'Company name is required.'
    if (!form.hqLocation.trim()) errors.hqLocation = 'HQ location is required.'
    if (!form.contactName.trim()) errors.contactName = 'Contact name is required.'
    if (!form.title.trim()) errors.title = 'Title is required.'
    if (!form.email.trim()) {
      errors.email = 'Email is required.'
    } else if (!EMAIL_RE.test(form.email.trim())) {
      errors.email = 'Please enter a valid email address.'
    }
    if (!form.phone.trim()) {
      errors.phone = 'Phone number is required.'
    } else if (!PHONE_RE.test(form.phone.trim())) {
      errors.phone = 'Please enter a valid phone number.'
    }
    const fleetSize = Number(form.fleetSize)
    if (!form.fleetSize.trim()) {
      errors.fleetSize = 'Fleet size is required.'
    } else if (!Number.isInteger(fleetSize) || fleetSize < 1 || fleetSize > 100000) {
      errors.fleetSize = 'Enter a whole number between 1 and 100,000.'
    }

    const fileError = validateFile(file)
    if (fileError) errors.file = fileError

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setSubmitting(true)
    try {
      const body = new FormData()
      body.append('submitterName', form.submitterName.trim())
      body.append('submitterEmail', form.submitterEmail.trim())
      body.append('companyName', form.companyName.trim())
      body.append('hqLocation', form.hqLocation.trim())
      body.append('contactName', form.contactName.trim())
      body.append('title', form.title.trim())
      body.append('email', form.email.trim())
      body.append('phone', form.phone.trim())
      body.append('fleetSize', form.fleetSize.trim())
      body.append('notes', form.notes.trim())
      if (file) body.append('file', file)

      const res = await fetch('/api/partner-intake', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Partner intake submit error:', err)
      setSubmitError('Something went wrong. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-2xl mb-5">
            <CheckCircle2 size={28} className="text-green-600" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">Thanks — we&apos;ll follow up shortly</h1>
          <p className="text-sm text-zinc-500">
            Your fleet information and transaction report have been received. A member of our team will
            be in touch soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-accent rounded-xl mb-4">
            <Zap size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Fleet Partner Intake</h1>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 8px rgba(0,0,0,0.03)' }}>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.submitterName}
                  onChange={handleChange('submitterName')}
                  className="input-field"
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
                {fieldErrors.submitterName && <p className="text-xs text-red-600 mt-1">{fieldErrors.submitterName}</p>}
              </div>

              <div>
                <label className="input-label">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.submitterEmail}
                  onChange={handleChange('submitterEmail')}
                  className="input-field"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                {fieldErrors.submitterEmail && <p className="text-xs text-red-600 mt-1">{fieldErrors.submitterEmail}</p>}
              </div>
            </div>

            <div>
              <label className="input-label">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={handleChange('companyName')}
                className="input-field"
                placeholder="Acme Logistics"
              />
              {fieldErrors.companyName && <p className="text-xs text-red-600 mt-1">{fieldErrors.companyName}</p>}
            </div>

            <div>
              <label className="input-label">
                HQ Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.hqLocation}
                onChange={handleChange('hqLocation')}
                className="input-field"
                placeholder="Charlotte, NC"
              />
              {fieldErrors.hqLocation && <p className="text-xs text-red-600 mt-1">{fieldErrors.hqLocation}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={handleChange('contactName')}
                  className="input-field"
                  placeholder="Jane Doe"
                />
                {fieldErrors.contactName && <p className="text-xs text-red-600 mt-1">{fieldErrors.contactName}</p>}
              </div>

              <div>
                <label className="input-label">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={handleChange('title')}
                  className="input-field"
                  placeholder="Fleet Manager"
                />
                {fieldErrors.title && <p className="text-xs text-red-600 mt-1">{fieldErrors.title}</p>}
              </div>
            </div>

            <div>
              <label className="input-label">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                className="input-field"
                placeholder="jane@acmelogistics.com"
                autoComplete="email"
              />
              {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handleChange('phone')}
                  className="input-field"
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                />
                {fieldErrors.phone && <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
              </div>

              <div>
                <label className="input-label">
                  Fleet Size <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={form.fleetSize}
                  onChange={handleChange('fleetSize')}
                  className="input-field"
                  placeholder="150"
                  min={1}
                  max={100000}
                  step={1}
                />
                {fieldErrors.fleetSize && <p className="text-xs text-red-600 mt-1">{fieldErrors.fleetSize}</p>}
              </div>
            </div>

            <div>
              <label className="input-label">Notes</label>
              <textarea
                value={form.notes}
                onChange={handleNotesChange}
                className="input-field"
                rows={4}
                placeholder="Anything else we should know about your fleet or fueling needs?"
                maxLength={2000}
              />
            </div>

            <div>
              <label className="input-label">
                90-Day Transaction Report <span className="text-red-500">*</span>
              </label>

              {file ? (
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-accent flex-shrink-0" />
                    <span className="text-sm text-zinc-700 truncate">{file.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-zinc-400 hover:text-zinc-600 flex-shrink-0"
                    aria-label="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition-colors">
                  <UploadCloud size={20} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600">Click to upload .csv, .xlsx, .xls, or .pdf</span>
                  <span className="text-xs text-zinc-400">Max 25MB</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
              {fieldErrors.file && <p className="text-xs text-red-600 mt-1">{fieldErrors.file}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-1"
            >
              {submitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 border-2"></div>
                  Submitting...
                </>
              ) : (
                'Submit'
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
