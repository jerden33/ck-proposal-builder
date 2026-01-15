'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getUserProfile, getProductsConfig, updateProductConfig, getAppSettings, updateAppSetting, getImageSettings, updateProductImage, updateHeroImage } from '@/lib/supabase/queries'
import type { UserProfile, ProductConfig, AppSetting, ImageSettings } from '@/lib/types'
import { ArrowLeft, Save, Plus, X, Settings as SettingsIcon, ImageIcon } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'products' | 'images' | 'settings'>('products')

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
        </div>

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-off-black mb-2">Default Product Features</h2>
                <p className="text-gray-600">
                  Configure the default features that appear when users create new proposals
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
                  Upload and manage images used throughout proposals
                </p>
              </div>
            </div>

            {/* Product Card Images */}
            <div className="card">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-off-black mb-2">Product Card Images</h3>
                <p className="text-sm text-gray-600">
                  These images appear on product cards in proposals. Recommended size: 600×400px (3:2 ratio)
                </p>
              </div>

              <div className="space-y-8">
                {/* Fleet Card Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.fleet}
                  onImageChange={(url) => handleProductImageChange('fleet', url)}
                  folder="products"
                  label="Circle K Pro Fleet Card"
                  recommendedSize="600×400px"
                  aspectRatio="3:2"
                />

                {/* Universal Card Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.universal}
                  onImageChange={(url) => handleProductImageChange('universal', url)}
                  folder="products"
                  label="Circle K Pro Universal Card (WEX Network)"
                  recommendedSize="600×400px"
                  aspectRatio="3:2"
                />

                {/* Digital+ Image */}
                <ImageUploader
                  currentImageUrl={imageSettings.product_images.digital}
                  onImageChange={(url) => handleProductImageChange('digital', url)}
                  folder="products"
                  label="Digital+"
                  recommendedSize="600×400px"
                  aspectRatio="3:2"
                />
              </div>
            </div>

            {/* Hero Image */}
            <div className="card">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-off-black mb-2">Hero Image</h3>
                <p className="text-sm text-gray-600">
                  Optional banner image displayed at the top of proposals. Recommended size: 1920×600px (16:5 ratio)
                </p>
              </div>

              <ImageUploader
                currentImageUrl={imageSettings.hero_image}
                onImageChange={handleHeroImageChange}
                folder="hero"
                label="Proposal Hero Image"
                recommendedSize="1920×600px"
                aspectRatio="16:5"
              />
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
