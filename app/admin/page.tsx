'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  getUserProfile, getProductsConfig, updateProductConfig,
  getAppSettings, updateAppSetting, getImageSettings,
  updateProductImage, updateHeroImage,
  getFMCSADatasetMeta, uploadFMCSADataset,
  type FMCSADatasetMeta,
} from '@/lib/supabase/queries'
import { parseFMCSAFile } from '@/lib/fmcsa-parser'
import type { UserProfile, ProductConfig, AppSetting, ImageSettings } from '@/lib/types'
import {
  ArrowLeft, Save, Plus, X, Settings as SettingsIcon,
  Upload, Truck, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Download,
} from 'lucide-react'
import { ImageUploader } from '@/components/ImageUploader'

const FMCSA_DOWNLOAD_URL = 'https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx'

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [products, setProducts] = useState<ProductConfig[]>([])
  const [appSettings, setAppSettings] = useState<AppSetting[]>([])
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    product_images: { fleet: null, universal: null, digital: null },
    hero_image: null,
    feature_icons: {}
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'products' | 'images' | 'settings' | 'fmcsa'>('products')

  // FMCSA dataset state
  const [fmcsaMeta, setFmcsaMeta] = useState<FMCSADatasetMeta | null>(null)
  const [fmcsaUploading, setFmcsaUploading] = useState(false)
  const [fmcsaProgress, setFmcsaProgress] = useState<string | null>(null)
  const [fmcsaError, setFmcsaError] = useState<string | null>(null)
  const [fmcsaSuccess, setFmcsaSuccess] = useState<string | null>(null)
  const fmcsaFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const userProfile = await getUserProfile()

    if (!userProfile?.is_admin) {
      router.push('/dashboard')
      return
    }

    setProfile(userProfile)

    const [productsData, settingsData, imagesData, fmcsaMetaData] = await Promise.all([
      getProductsConfig(),
      getAppSettings(),
      getImageSettings(),
      getFMCSADatasetMeta(),
    ])

    setProducts(productsData)
    setAppSettings(settingsData)
    setImageSettings(imagesData)
    setFmcsaMeta(fmcsaMetaData)
    setLoading(false)
  }

  const handleFMCSAUpload = async (file: File) => {
    setFmcsaUploading(true)
    setFmcsaError(null)
    setFmcsaSuccess(null)
    setFmcsaProgress(null)
    try {
      const text = await file.text()
      const { carriers, errors } = parseFMCSAFile(text)
      if (errors.length > 0) { setFmcsaError(errors.join(' ')); return }
      if (carriers.length === 0) { setFmcsaError('No records found in the file.'); return }

      setFmcsaProgress(`Parsed ${carriers.length.toLocaleString()} carriers — saving to database…`)

      const ok = await uploadFMCSADataset(carriers, profile?.email ?? 'admin', (saved, total) => {
        setFmcsaProgress(`Saving ${saved.toLocaleString()} / ${total.toLocaleString()} carriers…`)
      })
      if (!ok) { setFmcsaError('Failed to save dataset — check Supabase connection.'); return }

      const meta = await getFMCSADatasetMeta()
      setFmcsaMeta(meta)
      setFmcsaSuccess(`Dataset saved — ${carriers.length.toLocaleString()} carriers loaded.`)
    } catch (err) {
      setFmcsaError('Parse error. Check that the file is a valid FMCSA CSV.')
      console.error(err)
    } finally {
      setFmcsaUploading(false)
      setFmcsaProgress(null)
    }
  }

  const handleUpdateProduct = (id: string, field: keyof ProductConfig, value: any) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleAddFeature = (productId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId
        ? { ...p, default_features: [...p.default_features, ''] }
        : p
    ))
  }

  const handleRemoveFeature = (productId: string, index: number) => {
    setProducts(prev => prev.map(p =>
      p.id === productId
        ? { ...p, default_features: p.default_features.filter((_, i) => i !== index) }
        : p
    ))
  }

  const handleUpdateFeature = (productId: string, index: number, value: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId
        ? {
            ...p,
            default_features: p.default_features.map((f, i) => i === index ? value : f)
          }
        : p
    ))
  }

  const handleSaveProducts = async () => {
    setSaving(true)
    try {
      for (const product of products) {
        await updateProductConfig(product.id, {
          name: product.name,
          description: product.description,
          default_features: product.default_features
        })
      }
      alert('Product configurations saved successfully!')
    } catch (error) {
      console.error('Error saving products:', error)
      alert('Error saving products. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSetting = (key: string, value: string) => {
    setAppSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s))
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      for (const setting of appSettings) {
        await updateAppSetting(setting.key, setting.value)
      }
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Error saving settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleProductImageChange = async (productId: 'fleet' | 'universal' | 'digital', url: string | null) => {
    try {
      // Update local state optimistically
      setImageSettings(prev => ({
        ...prev,
        product_images: {
          ...prev.product_images,
          [productId]: url
        }
      }))

      // Save to database
      const success = await updateProductImage(productId, url)
      if (!success) {
        throw new Error('Failed to save image')
      }
    } catch (error) {
      console.error('Error updating product image:', error)
      alert('Error saving image. Please try again.')
      // Reload data to reset state
      loadData()
    }
  }

  const handleHeroImageChange = async (url: string | null) => {
    try {
      // Update local state optimistically
      setImageSettings(prev => ({
        ...prev,
        hero_image: url
      }))

      // Save to database
      const success = await updateHeroImage(url)
      if (!success) {
        throw new Error('Failed to save hero image')
      }
    } catch (error) {
      console.error('Error updating hero image:', error)
      alert('Error saving hero image. Please try again.')
      // Reload data to reset state
      loadData()
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowLeft size={18} />
                Back to Dashboard
              </button>

              <div className="h-8 w-px bg-gray-300"></div>

              <Image
                src="/circle-k-pro-logo.png"
                alt="Circle K Pro"
                width={120}
                height={36}
                className="w-32 h-auto"
              />

              <div className="h-8 w-px bg-gray-300"></div>

              <div className="flex items-center gap-3">
                <SettingsIcon size={20} className="text-brand-orange" />
                <h1 className="text-xl font-bold text-off-black">Admin Panel</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('products')}
            className={`pb-4 px-2 font-semibold transition-colors relative ${
              activeTab === 'products'
                ? 'text-brand-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Product Configuration
            {activeTab === 'products' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`pb-4 px-2 font-semibold transition-colors relative ${
              activeTab === 'images'
                ? 'text-brand-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Image Library
            {activeTab === 'images' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-4 px-2 font-semibold transition-colors relative ${
              activeTab === 'settings'
                ? 'text-brand-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            App Settings
            {activeTab === 'settings' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab('fmcsa')}
            className={`pb-4 px-2 font-semibold transition-colors relative flex items-center gap-1.5 ${
              activeTab === 'fmcsa'
                ? 'text-brand-orange'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Truck size={15} />
            FMCSA Dataset
            {fmcsaMeta && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                {fmcsaMeta.recordCount.toLocaleString()}
              </span>
            )}
            {activeTab === 'fmcsa' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"></div>
            )}
          </button>
        </div>

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-off-black mb-2">Default Product Features</h2>
                <p className="text-gray-600">
                  Configure the default features for each Circle K fleet product
                </p>
              </div>

              <button
                onClick={handleSaveProducts}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="loading-spinner w-4 h-4 border-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </button>
            </div>

            {products.map((product) => (
              <div key={product.id} className="card">
                <h3 className="text-xl font-bold text-off-black mb-4">{product.id}</h3>

                <div className="space-y-4">
                  <div>
                    <label className="input-label">Product Name</label>
                    <input
                      type="text"
                      value={product.name}
                      onChange={(e) => handleUpdateProduct(product.id, 'name', e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="input-label">Description</label>
                    <textarea
                      value={product.description}
                      onChange={(e) => handleUpdateProduct(product.id, 'description', e.target.value)}
                      rows={2}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="input-label">Default Features</label>
                    <div className="space-y-3 mb-3">
                      {product.default_features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <span className="text-brand-orange font-bold text-lg mt-2">•</span>
                          <input
                            type="text"
                            value={feature}
                            onChange={(e) => handleUpdateFeature(product.id, index, e.target.value)}
                            placeholder="Enter feature..."
                            className="flex-1 input-field"
                          />
                          <button
                            onClick={() => handleRemoveFeature(product.id, index)}
                            className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors mt-1"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleAddFeature(product.id)}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-brand-orange hover:bg-orange-50 transition-all flex items-center justify-center gap-2 text-gray-600 hover:text-brand-orange font-medium"
                    >
                      <Plus size={18} />
                      Add Feature
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Images Tab */}
        {activeTab === 'images' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-off-black mb-2">Image Library</h2>
                <p className="text-gray-600">
                  Upload and manage images used throughout the application
                </p>
              </div>
            </div>

            {/* Product Card Images */}
            <div className="card">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-off-black mb-2">Product Card Images</h3>
                <p className="text-sm text-gray-600">
                  Product card images. Recommended size: 600×338px (16:9 ratio)
                </p>
              </div>

              <div className="space-y-8">
                {/* Fleet Card Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.fleet}
                  onImageChange={(url) => handleProductImageChange('fleet', url)}
                  folder="products"
                  label="Circle K Pro Fleet Card"
                  recommendedSize="600×338px"
                  aspectRatio="16:9"
                />

                {/* Universal Card Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.universal}
                  onImageChange={(url) => handleProductImageChange('universal', url)}
                  folder="products"
                  label="Circle K Pro Universal Card (WEX Network)"
                  recommendedSize="600×338px"
                  aspectRatio="16:9"
                />

                {/* Digital+ Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.digital}
                  onImageChange={(url) => handleProductImageChange('digital', url)}
                  folder="products"
                  label="Digital+"
                  recommendedSize="600×338px"
                  aspectRatio="16:9"
                />
              </div>
            </div>

            {/* Hero Image */}
            <div className="card">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-off-black mb-2">Hero Image</h3>
                <p className="text-sm text-gray-600">
                  Optional banner image. Recommended size: 1920×600px (16:5 ratio)
                </p>
              </div>

              <ImageUploader
                currentImageUrl={imageSettings.hero_image}
                onImageChange={handleHeroImageChange}
                folder="hero"
                label="Hero Image"
                recommendedSize="1920×600px"
                aspectRatio="16:5"
              />
            </div>
          </div>
        )}

        {/* FMCSA Dataset Tab */}
        {activeTab === 'fmcsa' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h2 className="text-2xl font-bold text-off-black mb-1">FMCSA Carrier Dataset</h2>
              <p className="text-gray-500 text-sm">
                Upload the FMCSA SAFER Census CSV to populate the OTR Prospects tool for all users.
                The dataset is shared globally — uploading replaces the existing data.
              </p>
            </div>

            {/* Current dataset status */}
            {fmcsaMeta ? (
              <div className="card border-green-200 bg-green-50/40">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-green-800">
                      Dataset active — {fmcsaMeta.recordCount.toLocaleString()} carriers
                    </p>
                    <p className="text-sm text-green-700">
                      Last updated {new Date(fmcsaMeta.lastUpdated).toLocaleString()} by {fmcsaMeta.uploadedBy}
                    </p>
                    <p className="text-sm text-green-600">
                      States covered: {fmcsaMeta.statesCovered.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-amber-200 bg-amber-50/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">No dataset loaded</p>
                    <p className="text-sm text-amber-600 mt-0.5">
                      OTR Prospects is empty for all users until you upload a dataset below.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Success message */}
            {fmcsaSuccess && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
                <CheckCircle2 size={15} /> {fmcsaSuccess}
              </div>
            )}

            {/* Error message */}
            {fmcsaError && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {fmcsaError}
              </div>
            )}

            {/* Upload zone */}
            <div className="card">
              <h3 className="font-semibold text-off-black mb-1">Upload New Dataset</h3>
              <p className="text-sm text-gray-500 mb-4">
                Accepts FMCSA Census CSV (comma or pipe-delimited). Download the latest file from
                the FMCSA website, then upload it here. No geocoding — uploading is instant.
              </p>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) handleFMCSAUpload(f)
                }}
                onClick={() => fmcsaFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
                  ${fmcsaUploading
                    ? 'border-brand-orange bg-orange-50/30 cursor-not-allowed'
                    : 'border-gray-200 hover:border-brand-orange hover:bg-orange-50/20'}`}
              >
                {fmcsaUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
                    <p className="font-medium text-gray-600">
                      {fmcsaProgress ?? 'Parsing and saving dataset…'}
                    </p>
                    <p className="text-xs text-gray-400">This may take several minutes for large files</p>
                  </div>
                ) : (
                  <>
                    <Upload size={28} className="text-gray-300 mx-auto mb-3" />
                    <p className="font-medium text-gray-600 mb-1">Drop CSV here or click to browse</p>
                    <p className="text-xs text-gray-400">
                      FMCSA Census CSV · comma or pipe-delimited · replaces existing dataset
                    </p>
                  </>
                )}
                <input
                  ref={fmcsaFileRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  className="hidden"
                  disabled={fmcsaUploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFMCSAUpload(f)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Expected columns */}
              <div className="mt-4 bg-zinc-50 rounded-xl p-4 text-xs text-zinc-500 space-y-1.5">
                <p className="font-semibold text-zinc-600">Expected columns (required):</p>
                <p className="font-mono text-zinc-400 break-all">
                  DOT_NUMBER · LEGAL_NAME
                </p>
                <p className="font-semibold text-zinc-600 mt-2">Optional columns (used when present):</p>
                <p className="font-mono text-zinc-400 break-all">
                  DBA_NAME · PHY_STREET · PHY_CITY · PHY_STATE · PHY_ZIP · TELEPHONE ·
                  NBR_POWER_UNIT · DRIVER_TOTAL · CARRIER_OPERATION · CARGO_CARRIED ·
                  RECORD_STATUS · MCS150_DATE · HM_FLAG · PC_FLAG
                </p>
              </div>
            </div>

            {/* Links */}
            <div className="flex gap-4 text-sm">
              <a
                href={FMCSA_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-accent hover:underline"
              >
                <RefreshCw size={13} /> Download latest from FMCSA
              </a>
              <a
                href="/sample-fmcsa.csv"
                download
                className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-600"
              >
                <Download size={13} /> Sample CSV (10 records)
              </a>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-off-black mb-2">Application Settings</h2>
                <p className="text-gray-600">
                  Configure global application settings and content
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="loading-spinner w-4 h-4 border-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </button>
            </div>

            <div className="card space-y-6">
              {appSettings.map((setting) => (
                <div key={setting.id}>
                  <label className="input-label capitalize">
                    {setting.key.replace(/_/g, ' ')}
                  </label>
                  {setting.key.includes('text') || setting.key.includes('terms') ? (
                    <textarea
                      value={setting.value}
                      onChange={(e) => handleUpdateSetting(setting.key, e.target.value)}
                      rows={6}
                      className="input-field"
                      placeholder={`Enter ${setting.key.replace(/_/g, ' ')}...`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={setting.value}
                      onChange={(e) => handleUpdateSetting(setting.key, e.target.value)}
                      className="input-field"
                      placeholder={`Enter ${setting.key.replace(/_/g, ' ')}...`}
                    />
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Last updated: {new Date(setting.updated_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
