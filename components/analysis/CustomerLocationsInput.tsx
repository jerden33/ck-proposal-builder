'use client'

import { useRef, useState } from 'react'
import { Flag, ChevronDown, ChevronUp, Plus, X, Upload } from 'lucide-react'
import { parseCustomerLocationsCSV, type CustomerLocationInput } from '@/lib/transaction-parser'

const EMPTY_ROW: CustomerLocationInput = { name: '', address: '', city: '', state: '', zip: '' }

export function CustomerLocationsInput({
  locations,
  onChange,
}: {
  locations: CustomerLocationInput[]
  onChange: (locations: CustomerLocationInput[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const updateRow = (i: number, field: keyof CustomerLocationInput, value: string) => {
    const next = [...locations]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }

  const addRow = () => onChange([...locations, { ...EMPTY_ROW }])
  const removeRow = (i: number) => onChange(locations.filter((_, idx) => idx !== i))

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    try {
      const content = await file.text()
      const { locations: parsed, errors } = parseCustomerLocationsCSV(content)
      if (errors.length > 0 && parsed.length === 0) {
        setCsvError(errors[0])
      } else {
        onChange([...locations.filter(l => l.address || l.city), ...parsed])
        setOpen(true)
      }
    } catch {
      setCsvError('Could not read that file.')
    }
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  const filledCount = locations.filter(l => l.address && l.city).length

  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Flag size={14} className="text-gray-400" />
          Customer Locations <span className="text-gray-400 font-normal">— optional</span>
          {filledCount > 0 && (
            <span className="text-xs font-semibold bg-accent-muted/30 text-accent rounded-full px-2 py-0.5">{filledCount}</span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 pt-3">
            Add the customer&apos;s own facility locations (depots, yards, corporate offices) to show them on the map with a flag icon.
          </p>

          {locations.map((loc, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="grid grid-cols-12 gap-1.5 flex-1">
                <input
                  type="text"
                  value={loc.name}
                  onChange={e => updateRow(i, 'name', e.target.value)}
                  placeholder="Location name"
                  className="col-span-3 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <input
                  type="text"
                  value={loc.address}
                  onChange={e => updateRow(i, 'address', e.target.value)}
                  placeholder="Street address"
                  className="col-span-4 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <input
                  type="text"
                  value={loc.city}
                  onChange={e => updateRow(i, 'city', e.target.value)}
                  placeholder="City"
                  className="col-span-2 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <input
                  type="text"
                  value={loc.state}
                  onChange={e => updateRow(i, 'state', e.target.value)}
                  placeholder="ST"
                  maxLength={2}
                  className="col-span-1 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <input
                  type="text"
                  value={loc.zip}
                  onChange={e => updateRow(i, 'zip', e.target.value)}
                  placeholder="Zip"
                  className="col-span-2 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove location"
                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1.5"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <Plus size={13} /> Add location
            </button>
            <span className="text-xs text-gray-300">or</span>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Upload size={13} /> Upload CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleCSV}
              className="hidden"
            />
            <span className="text-xs text-gray-300">Name, Address, City, State, Zip columns</span>
          </div>

          {csvError && <p className="text-xs text-red-500">{csvError}</p>}
        </div>
      )}
    </div>
  )
}
