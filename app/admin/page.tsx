'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getUserProfile, getProductsConfig, updateProductConfig, getAppSettings, updateAppSetting, getImageSettings, updateProductImage, updateHeroImage } from '@/lib/supabase/queries'
import type { UserProfile, ProductConfig, AppSetting, ImageSettings } from '@/lib/types'
import { ArrowLeft, Save, Plus, X, Settings as SettingsIcon, Upload, MapPin, RotateCcw, CheckCircle } from 'lucide-react'
import { ImageUploader } from '@/components/ImageUploader'

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
  const [activeTab, setActiveTab] = useState<'products' | 'images' | 'settings' | 'stores'>('products')

  // Store data upload state
  const [storeInfo, setStoreInfo] = useState<{ hasCustomFile: boolean; updatedAt: string | null } | null>(null)
  const [storeFile, setStoreFile] = useState<File | null>(null)
  const [storePreview, setStorePreview] = useState<{ count: number; error: string | null } | null>(null)
  const [storeUploading, setStoreUploading] = useState(false)
  const [storeSuccess, setStoreSuccess] = useState(false)

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

    const [productsData, settingsData, imagesData] = await Promise.all([
      getProductsConfig(),
      getAppSettings(),
      getImageSettings()
    ])

    setProducts(productsData)
    setAppSettings(settingsData)
    setImageSettings(imagesData)

    if (userProfile.is_super_admin) {
      fetch('/api/stores-upload')
        .then(r => r.json())
        .then(d => setStoreInfo(d))
        .catch(() => {})
    }

    setLoading(false)
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

  const handleStoreFileChange = async (file: File | null) => {
    setStoreFile(file)
    setStoreSuccess(false)
    if (!file) { setStorePreview(null); return }

    try {
      const text = await file.text()
      const isCSV = file.name.toLowerCase().endsWith('.csv')
      if (isCSV) {
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

          {profile?.is_super_admin && (
            <button
              onClick={() => setActiveTab('stores')}
              className={`pb-4 px-2 font-semibold transition-colors relative ${
                activeTab === 'stores'
                  ? 'text-brand-orange'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Store Locations
              {activeTab === 'stores' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"></div>
              )}
            </button>
          )}
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

        {/* Store Locations Tab — super admin only */}
        {activeTab === 'stores' && profile?.is_super_admin && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-off-black mb-2">Circle K Store Locations</h2>
              <p className="text-gray-600">
                Upload an updated store list to replace the bundled default (5,238 locations). Used for all proximity analysis.
              </p>
            </div>

            {/* Current status */}
            <div className="card flex items-start gap-4">
              <MapPin size={20} className="text-brand-orange shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-off-black">
                  {storeInfo?.hasCustomFile ? 'Custom store file active' : 'Using bundled default (5,238 stores)'}
                </p>
                {storeInfo?.updatedAt && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last updated: {new Date(storeInfo.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              {storeInfo?.hasCustomFile && (
                <button
                  onClick={handleStoreRevert}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
                >
                  <RotateCcw size={14} />
                  Revert to default
                </button>
              )}
            </div>

            {/* Upload */}
            <div className="card space-y-4">
              <div>
                <h3 className="font-semibold text-off-black mb-1">Upload new store list</h3>
                <p className="text-sm text-gray-500">
                  Accepts <strong>CSV</strong> or <strong>JSON</strong>. CSV required columns: <code className="bg-gray-100 px-1 rounded text-xs">Latitude</code>, <code className="bg-gray-100 px-1 rounded text-xs">Longitude</code>, <code className="bg-gray-100 px-1 rounded text-xs">City</code>, <code className="bg-gray-100 px-1 rounded text-xs">State</code>.
                  Optional: <code className="bg-gray-100 px-1 rounded text-xs">Site Number</code>, <code className="bg-gray-100 px-1 rounded text-xs">Name</code>, <code className="bg-gray-100 px-1 rounded text-xs">Address</code>, <code className="bg-gray-100 px-1 rounded text-xs">Zip</code>, <code className="bg-gray-100 px-1 rounded text-xs">Truck Accessible</code>, <code className="bg-gray-100 px-1 rounded text-xs">Truck Lanes</code>, <code className="bg-gray-100 px-1 rounded text-xs">Status</code>.
                </p>
              </div>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-orange hover:bg-orange-50 transition-all">
                <Upload size={20} className="text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">
                  {storeFile ? storeFile.name : 'Click to select CSV or JSON file'}
                </span>
                <input
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={e => handleStoreFileChange(e.target.files?.[0] ?? null)}
                />
              </label>

              {storePreview && (
                <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${storePreview.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {storePreview.error
                    ? <><X size={14} />{storePreview.error}</>
                    : <><CheckCircle size={14} />{storePreview.count.toLocaleString()} stores detected — ready to upload</>}
                </div>
              )}

              {storeSuccess && (
                <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle size={14} />Store file uploaded successfully. New analyses will use the updated locations.
                </div>
              )}

              <button
                onClick={handleStoreUpload}
                disabled={!storeFile || !!storePreview?.error || storeUploading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {storeUploading ? (
                  <><div className="loading-spinner w-4 h-4 border-2"></div>Uploading...</>
                ) : (
                  <><Upload size={16} />Upload Store File</>
                )}
              </button>
            </div>

            {/* Format reference */}
            <div className="card bg-gray-50">
              <h3 className="font-semibold text-off-black mb-3 text-sm">CSV Format Reference</h3>
              <pre className="text-xs text-gray-600 overflow-x-auto bg-white border border-gray-200 rounded-lg p-3 leading-relaxed">{`Site Number,Name,Address,City,State,Zip,Latitude,Longitude,Truck Accessible,Truck Lanes,Status
2746601,Circle K,1405 S Bragaw,Anchorage,AK,99508,61.208429,-149.807546,false,0,Open
2746602,Circle K,10630 Old Seward Hwy,Anchorage,AK,99515,61.124596,-149.865242,true,2,Open`}</pre>
              <p className="text-xs text-gray-400 mt-2">Column headers are flexible — the parser handles common variations (e.g. &quot;Lat&quot; / &quot;Latitude&quot;, &quot;Lng&quot; / &quot;Longitude&quot;).</p>
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
