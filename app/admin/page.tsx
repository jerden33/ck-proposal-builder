'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getUserProfile, getAppSettings, updateAppSetting } from '@/lib/supabase/queries'
import type { UserProfile } from '@/lib/types'
import { ArrowLeft, Save, Settings as SettingsIcon, Upload, MapPin, RotateCcw, CheckCircle, X } from 'lucide-react'

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'stores'>('rules')

  // Analysis Rules state
  const [captureRadius, setCaptureRadius]   = useState(10)
  const [loyalThreshold, setLoyalThreshold] = useState(70)
  const [mixedThreshold, setMixedThreshold]       = useState(20)
  const [defaultRebate, setDefaultRebate]         = useState(3)
  const [otrDieselThreshold, setOtrDieselThreshold] = useState(60)

  // Store data upload state
  const [storeInfo, setStoreInfo]       = useState<{ hasCustomFile: boolean; updatedAt: string | null } | null>(null)
  const [storeFile, setStoreFile]       = useState<File | null>(null)
  const [storePreview, setStorePreview] = useState<{ count: number; error: string | null } | null>(null)
  const [storeUploading, setStoreUploading] = useState(false)
  const [storeSuccess, setStoreSuccess]     = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const userProfile = await getUserProfile()
    if (!userProfile?.is_admin) { router.push('/dashboard'); return }
    setProfile(userProfile)

    const settings = await getAppSettings()
    const get = (key: string, fallback: number) => {
      const v = settings.find(s => s.key === key)?.value
      return v !== undefined ? parseFloat(v) : fallback
    }
    setCaptureRadius(get('capture_radius', 10))
    setLoyalThreshold(get('loyal_threshold', 70))
    setMixedThreshold(get('mixed_threshold', 20))
    setDefaultRebate(get('default_rebate_cents', 3))
    setOtrDieselThreshold(get('otr_diesel_threshold', 60))

    if (userProfile.is_super_admin) {
      fetch('/api/stores-upload')
        .then(r => r.json())
        .then(d => setStoreInfo(d))
        .catch(() => {})
    }

    setLoading(false)
  }

  const handleSaveRules = async () => {
    if (mixedThreshold >= loyalThreshold) {
      alert('Mixed threshold must be less than Loyal threshold.')
      return
    }
    setSaving(true)
    setSaveSuccess(false)
    try {
      await Promise.all([
        updateAppSetting('capture_radius',        String(captureRadius)),
        updateAppSetting('loyal_threshold',       String(loyalThreshold)),
        updateAppSetting('mixed_threshold',       String(mixedThreshold)),
        updateAppSetting('default_rebate_cents',  String(defaultRebate)),
        updateAppSetting('otr_diesel_threshold',  String(otrDieselThreshold)),
      ])
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      alert('Error saving settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Store upload handlers
  const handleStoreFileChange = async (file: File | null) => {
    setStoreFile(file)
    setStoreSuccess(false)
    if (!file) { setStorePreview(null); return }
    try {
      const text = await file.text()
      if (file.name.toLowerCase().endsWith('.csv')) {
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        setStorePreview({ count: Math.max(0, lines.length - 1), error: null })
      } else {
        const parsed = JSON.parse(text)
        const stores = Array.isArray(parsed) ? parsed : parsed.stores
        if (!Array.isArray(stores)) throw new Error('JSON must contain a "stores" array')
        setStorePreview({ count: stores.length, error: null })
      }
    } catch (err) {
      setStorePreview({ count: 0, error: err instanceof Error ? err.message : 'Failed to parse file' })
    }
  }

  const handleStoreUpload = async () => {
    if (!storeFile) return
    setStoreUploading(true)
    setStoreSuccess(false)
    try {
      const formData = new FormData()
      formData.append('file', storeFile)
      const res = await fetch('/api/stores-upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setStoreSuccess(true)
      setStoreFile(null)
      setStorePreview(null)
      setStoreInfo({ hasCustomFile: true, updatedAt: new Date().toISOString() })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setStoreUploading(false)
    }
  }

  const handleStoreRevert = async () => {
    if (!confirm('Remove the custom store file and revert to the bundled default?')) return
    const res = await fetch('/api/stores-upload', { method: 'DELETE' })
    if (res.ok) setStoreInfo({ hasCustomFile: false, updatedAt: null })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  const SliderRow = ({ label, desc, value, min, max, step, unit, onChange }: {
    label: string; desc: string; value: number; min: number; max: number; step: number; unit: string
    onChange: (v: number) => void
  }) => (
    <div className="flex items-start gap-6">
      <div className="flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <p className="font-semibold text-off-black text-sm">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full h-2 cursor-pointer accent-brand-orange"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
      </div>
      <div className="w-24 shrink-0">
        <input
          type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value) || min)}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-center font-bold text-off-black focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
        <p className="text-xs text-gray-400 text-center mt-0.5">{unit}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white to-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft size={18} />Back to Dashboard
          </button>
          <div className="h-8 w-px bg-gray-300" />
          <Image src="/circle-k-pro-logo.png" alt="Circle K Pro" width={120} height={36} className="w-32 h-auto" />
          <div className="h-8 w-px bg-gray-300" />
          <div className="flex items-center gap-3">
            <SettingsIcon size={20} className="text-brand-orange" />
            <h1 className="text-xl font-bold text-off-black">Admin Panel</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          {([['rules', 'Analysis Rules'], ['stores', 'Store Locations']] as const).map(([key, label]) => {
            if (key === 'stores' && !profile?.is_super_admin) return null
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`pb-4 px-2 font-semibold transition-colors relative ${activeTab === key ? 'text-brand-orange' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {label}
                {activeTab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange" />}
              </button>
            )
          })}
        </div>

        {/* ── Analysis Rules Tab ── */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-off-black mb-1">Analysis Rules</h2>
                <p className="text-gray-500 text-sm">
                  Default values used for all new analyses. Reps can override the capture radius per upload.
                </p>
              </div>
              <button
                onClick={handleSaveRules}
                disabled={saving}
                className="btn-primary flex items-center gap-2 shrink-0"
              >
                {saving ? <><div className="loading-spinner w-4 h-4 border-2" />Saving...</> : saveSuccess ? <><CheckCircle size={16} />Saved</> : <><Save size={16} />Save Changes</>}
              </button>
            </div>

            {/* Capture radius */}
            <div className="card space-y-2">
              <div className="mb-4">
                <h3 className="font-bold text-off-black">Capture Radius</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Non-CK gallons fueled within this distance of a CK store are counted as &ldquo;capturable.&rdquo;
                  Lower values work better in dense markets; higher values suit rural or highway fleets.
                </p>
              </div>
              <SliderRow
                label="Default capture radius"
                desc="miles — reps can override per analysis"
                value={captureRadius} min={1} max={25} step={1} unit=" mi"
                onChange={setCaptureRadius}
              />
              <div className="flex gap-2 mt-3 flex-wrap">
                {[2, 5, 10, 15, 25].map(v => (
                  <button
                    key={v}
                    onClick={() => setCaptureRadius(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${captureRadius === v ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-zinc-600 border-zinc-200 hover:border-brand-orange'}`}
                  >
                    {v} mi
                  </button>
                ))}
              </div>
            </div>

            {/* Loyalty segment thresholds */}
            <div className="card space-y-6">
              <div className="mb-2">
                <h3 className="font-bold text-off-black">CK Loyalty Segments</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  How drivers and vehicles are classified based on their Circle K fueling share.
                </p>
              </div>

              {/* Visual preview */}
              <div className="flex rounded-lg overflow-hidden h-6 text-[10px] font-semibold">
                <div className="flex items-center justify-center bg-green-500 text-white" style={{ width: `${100 - loyalThreshold}%` }}>
                  {loyalThreshold}–100%
                </div>
                <div className="flex items-center justify-center bg-blue-400 text-white" style={{ width: `${loyalThreshold - mixedThreshold}%` }}>
                  {mixedThreshold}–{loyalThreshold - 1}%
                </div>
                <div className="flex items-center justify-center bg-amber-400 text-white" style={{ width: `${mixedThreshold - 1}%` }}>
                  1–{mixedThreshold - 1}%
                </div>
                <div className="flex items-center justify-center bg-red-400 text-white" style={{ width: '1%', minWidth: '1.5rem' }}>
                  0%
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs text-center text-gray-500">
                <span className="font-semibold text-green-700">CK Loyal</span>
                <span className="font-semibold text-blue-700">Mixed</span>
                <span className="font-semibold text-amber-700">Mostly Competitor</span>
                <span className="font-semibold text-red-700">Never CK</span>
              </div>

              <SliderRow
                label="Loyal threshold"
                desc="min % to be CK-loyal"
                value={loyalThreshold} min={40} max={95} step={5} unit="%"
                onChange={v => setLoyalThreshold(Math.max(v, mixedThreshold + 5))}
              />
              <SliderRow
                label="Mixed threshold"
                desc="min % to avoid mostly-competitor"
                value={mixedThreshold} min={5} max={60} step={5} unit="%"
                onChange={v => setMixedThreshold(Math.min(v, loyalThreshold - 5))}
              />
              {mixedThreshold >= loyalThreshold && (
                <p className="text-xs text-red-600">Mixed threshold must be lower than Loyal threshold.</p>
              )}
            </div>

            {/* Default rebate rate */}
            <div className="card space-y-2">
              <div className="mb-4">
                <h3 className="font-bold text-off-black">Default Savings Rebate</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Pre-filled ¢/gal value in the savings calculator. Reps can adjust per proposal.
                </p>
              </div>
              <SliderRow
                label="Default rebate rate"
                desc="cents per gallon"
                value={defaultRebate} min={0.5} max={10} step={0.5} unit="¢/gal"
                onChange={setDefaultRebate}
              />
              <div className="flex gap-2 mt-3 flex-wrap">
                {[1, 2, 3, 4, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => setDefaultRebate(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${defaultRebate === v ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-zinc-600 border-zinc-200 hover:border-brand-orange'}`}
                  >
                    {v}¢
                  </button>
                ))}
              </div>
            </div>

            {/* OTR detection threshold */}
            <div className="card space-y-2">
              <div className="mb-4">
                <h3 className="font-bold text-off-black">OTR Fleet Detection</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Minimum diesel share to classify a fleet as OTR/long-haul. Only fleets meeting this threshold
                  get the corridor analysis tab. Lower values catch mixed fleets; higher values target true semi/truck operations.
                </p>
              </div>
              <SliderRow
                label="OTR diesel threshold"
                desc="min diesel % to trigger corridor analysis"
                value={otrDieselThreshold} min={10} max={95} step={5} unit="%"
                onChange={setOtrDieselThreshold}
              />
              <div className="flex gap-2 mt-3 flex-wrap">
                {[40, 50, 60, 70, 80].map(v => (
                  <button
                    key={v}
                    onClick={() => setOtrDieselThreshold(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${otrDieselThreshold === v ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-zinc-600 border-zinc-200 hover:border-brand-orange'}`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 pt-1">
                Current: a fleet must be <strong>{otrDieselThreshold}%+ diesel</strong> to receive OTR corridor analysis.
              </p>
            </div>
          </div>
        )}

        {/* ── Store Locations Tab (super admin only) ── */}
        {activeTab === 'stores' && profile?.is_super_admin && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-off-black mb-2">Circle K Store Locations</h2>
              <p className="text-gray-500 text-sm">
                Upload an updated store list to replace the bundled default (5,238 locations). Used for all proximity analysis.
              </p>
            </div>

            <div className="card flex items-start gap-4">
              <MapPin size={20} className="text-brand-orange shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-off-black">
                  {storeInfo?.hasCustomFile ? 'Custom store file active' : 'Using bundled default (5,238 stores)'}
                </p>
                {storeInfo?.updatedAt && (
                  <p className="text-xs text-gray-500 mt-0.5">Last updated: {new Date(storeInfo.updatedAt).toLocaleString()}</p>
                )}
              </div>
              {storeInfo?.hasCustomFile && (
                <button onClick={handleStoreRevert} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors">
                  <RotateCcw size={14} />Revert to default
                </button>
              )}
            </div>

            <div className="card space-y-4">
              <div>
                <h3 className="font-semibold text-off-black mb-1">Upload new store list</h3>
                <p className="text-sm text-gray-500">
                  Accepts <strong>CSV</strong> or <strong>JSON</strong>. Required columns: <code className="bg-gray-100 px-1 rounded text-xs">Latitude</code>, <code className="bg-gray-100 px-1 rounded text-xs">Longitude</code>, <code className="bg-gray-100 px-1 rounded text-xs">City</code>, <code className="bg-gray-100 px-1 rounded text-xs">State</code>.
                </p>
              </div>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-orange hover:bg-orange-50 transition-all">
                <Upload size={20} className="text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">{storeFile ? storeFile.name : 'Click to select CSV or JSON file'}</span>
                <input type="file" accept=".csv,.json" className="hidden" onChange={e => handleStoreFileChange(e.target.files?.[0] ?? null)} />
              </label>
              {storePreview && (
                <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${storePreview.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {storePreview.error ? <><X size={14} />{storePreview.error}</> : <><CheckCircle size={14} />{storePreview.count.toLocaleString()} stores detected — ready to upload</>}
                </div>
              )}
              {storeSuccess && (
                <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle size={14} />Store file uploaded successfully. New analyses will use the updated locations.
                </div>
              )}
              <button onClick={handleStoreUpload} disabled={!storeFile || !!storePreview?.error || storeUploading} className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {storeUploading ? <><div className="loading-spinner w-4 h-4 border-2" />Uploading...</> : <><Upload size={16} />Upload Store File</>}
              </button>
            </div>

            <div className="card bg-gray-50">
              <h3 className="font-semibold text-off-black mb-3 text-sm">CSV Format Reference</h3>
              <pre className="text-xs text-gray-600 overflow-x-auto bg-white border border-gray-200 rounded-lg p-3 leading-relaxed">{`Site Number,Name,Address,City,State,Zip,Latitude,Longitude,Truck Accessible,Truck Lanes,Status
2746601,Circle K,1405 S Bragaw,Anchorage,AK,99508,61.208429,-149.807546,false,0,Open
2746602,Circle K,10630 Old Seward Hwy,Anchorage,AK,99515,61.124596,-149.865242,true,2,Open`}</pre>
              <p className="text-xs text-gray-400 mt-2">Column headers are flexible — the parser handles common variations (e.g. &quot;Lat&quot; / &quot;Latitude&quot;, &quot;Lng&quot; / &quot;Longitude&quot;).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
