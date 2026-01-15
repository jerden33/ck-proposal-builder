'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { MapPin, TrendingUp, Users, Fuel, CheckCircle2, ImageIcon } from 'lucide-react'
import { MapComponent } from '@/components/MapComponent'
import { getProposal, incrementProposalViews, getImageSettings } from '@/lib/supabase/queries'
import type { OpportunityData, Address, ProposalSections, Product, ImageSettings } from '@/lib/types'

interface ProposalData {
  opportunityData: OpportunityData
  addresses: Address[]
  sections: ProposalSections
  products: Product[]
}

function ProposalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<ProposalData | null>(null)
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    product_images: { fleet: null, universal: null, digital: null },
    hero_image: null,
    feature_icons: {}
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const proposalId = searchParams.get('id')

    // Redirect old URL format to new format
    if (!proposalId && searchParams.get('data')) {
      // Old format with base64 data - redirect to login
      router.push('/login')
      return
    }

    async function loadProposal() {
      if (!proposalId) {
        setError('No proposal ID provided')
        setLoading(false)
        return
      }

      try {
        const [proposal, images] = await Promise.all([
          getProposal(proposalId),
          getImageSettings()
        ])

        if (!proposal) {
          setError('Proposal not found')
          setLoading(false)
          return
        }

        setData(proposal.data)
        setImageSettings(images)

        // Increment view count (fire and forget)
        incrementProposalViews(proposalId).catch(console.error)
      } catch (err) {
        console.error('Error loading proposal:', err)
        setError(err instanceof Error ? err.message : 'Failed to load proposal')
      } finally {
        setLoading(false)
      }
    }

    loadProposal()
  }, [searchParams, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposal...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-off-black mb-2">Proposal Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The proposal you\'re looking for doesn\'t exist or may have been removed.'}</p>
          <a href="/" className="btn-primary inline-block">
            Create New Proposal
          </a>
        </div>
      </div>
    )
  }

  const { opportunityData, addresses, sections, products: allProducts } = data
  const selectedProducts = allProducts.filter(p => opportunityData.selectedProducts.includes(p.id))

  // Calculate pricing
  const perGallonDiscount = parseFloat(opportunityData.perGallonDiscount) || 0
  const monthlyGallons = parseFloat(opportunityData.monthlyGallons) || 0
  const monthlySavings = perGallonDiscount * monthlyGallons
  const annualFuelSavings = monthlySavings * 12

  // Parse additional savings
  let additionalAnnualSavings = 0
  if (opportunityData.additionalSavings) {
    const additionalItems = opportunityData.additionalSavings.split('\n').filter(line => line.trim().length > 0)
    additionalItems.forEach(item => {
      const monthlyMatch = item.match(/\$([0-9,]+)\s*\/\s*mo(?:nth)?/i)
      if (monthlyMatch) {
        additionalAnnualSavings += parseFloat(monthlyMatch[1].replace(/,/g, '')) * 12
      }
      const annualMatch = item.match(/\$([0-9,]+)\s*\/\s*(?:year|yr|annually)/i)
      if (annualMatch) {
        additionalAnnualSavings += parseFloat(annualMatch[1].replace(/,/g, ''))
      }
    })
  }

  const totalAnnualValue = annualFuelSavings + additionalAnnualSavings
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white to-white">
      {/* PREMIUM HERO SECTION */}
      <section className="relative overflow-hidden border-b border-gray-200">
        {/* Hero Image Background */}
        {imageSettings.hero_image ? (
          <div className="relative h-[500px]">
            <Image
              src={imageSettings.hero_image}
              alt="Hero"
              fill
              className="object-cover"
              unoptimized
            />
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70"></div>

            {/* Content overlay */}
            <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 h-full flex flex-col justify-center">
              <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold mb-4 text-white tracking-tight drop-shadow-lg">
                  Fleet Fuel Solutions Proposal
                </h1>
                <div className="h-1 w-24 bg-gradient-to-r from-brand-orange to-dark-orange rounded-full mx-auto mb-8"></div>
              </div>

              <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 max-w-3xl mx-auto text-center shadow-2xl">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Prepared for</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-off-black">{opportunityData.customerName}</h2>
                <p className="text-gray-600">{today}</p>
              </div>
            </div>
          </div>
        ) : (
          /* Default hero without image */
          <div className="bg-gradient-to-br from-gray-50 via-off-white to-white">
            <div className="max-w-6xl mx-auto px-6 py-20">
              <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold mb-4 text-off-black tracking-tight">
                  Fleet Fuel Solutions Proposal
                </h1>
                <div className="h-1 w-24 bg-gradient-to-r from-brand-orange to-dark-orange rounded-full mx-auto mb-8"></div>
              </div>

              <div className="card max-w-3xl mx-auto text-center">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Prepared for</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-off-black">{opportunityData.customerName}</h2>
                <p className="text-gray-600">{today}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* EXECUTIVE SUMMARY */}
      {sections.executiveSummary && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-4xl font-bold text-dark-orange mb-8">Executive Summary</h2>

          <div className="card mb-8">
            <p className="text-lg text-gray-700 leading-relaxed">
              Circle K Pro is pleased to present this comprehensive fleet fuel solutions proposal tailored to meet {opportunityData.customerName}'s operational needs. Our program offers significant cost savings, nationwide coverage at over 6,000 locations, and streamlined fleet management tools.
            </p>
          </div>

          {/* Fleet Overview Stats */}
          {(opportunityData.fleetSize || opportunityData.monthlyGallons) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {opportunityData.fleetSize && (
                <div className="card hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Users size={28} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Fleet Size</p>
                      <p className="text-4xl font-bold text-off-black">{opportunityData.fleetSize}</p>
                      <p className="text-gray-600">vehicles</p>
                    </div>
                  </div>
                </div>
              )}

              {opportunityData.monthlyGallons && (
                <div className="card hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Fuel size={28} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Monthly Fuel Usage</p>
                      <p className="text-4xl font-bold text-off-black">{Number(opportunityData.monthlyGallons).toLocaleString()}</p>
                      <p className="text-gray-600">gallons</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PRICING SECTION */}
      {(sections.showEstimatedSavings || sections.showPerGallonDiscount || sections.showTotalAnnualValue) && monthlySavings > 0 && (
        <section className="bg-gradient-to-br from-gray-50 to-white py-16 border-y border-gray-200">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-4xl font-bold text-dark-orange mb-8">Pricing Breakdown</h2>

            {/* Main Pricing Box - Green Gradient */}
            {sections.showEstimatedSavings && (
              <div className="relative rounded-3xl p-10 mb-8 overflow-hidden shadow-2xl" style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              }}>
                <div className="relative z-10">
                  <div className="flex items-start gap-4 mb-8">
                    <div className="text-5xl">💰</div>
                    <div>
                      <h3 className="text-3xl font-bold mb-2 text-white">Estimated Fuel Savings</h3>
                      <div className="h-1 w-24 bg-white/30 rounded"></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                    <div>
                      <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-2">Per Gallon</p>
                      <p className="text-5xl font-bold text-white">{perGallonDiscount.toFixed(2)}¢</p>
                    </div>
                    <div>
                      <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-2">Monthly Gallons</p>
                      <p className="text-5xl font-bold text-white">{Number(monthlyGallons).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-2">Monthly Savings</p>
                      <p className="text-5xl font-bold text-white">${monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/20">
                    <p className="text-emerald-100 text-lg font-semibold uppercase tracking-wider mb-3">Annual Fuel Savings</p>
                    <p className="text-6xl md:text-7xl font-bold text-white">${annualFuelSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Savings */}
            {sections.showAdditionalSavings && opportunityData.additionalSavings && (
              <div className="card mb-8">
                <h3 className="text-2xl font-bold text-dark-orange mb-6">Additional Cost Savings</h3>
                <div className="space-y-4">
                  {opportunityData.additionalSavings.split('\n').filter(line => line.trim()).map((item, index) => (
                    <div key={index} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-white" />
                      </div>
                      <p className="text-base text-gray-700">{item.trim()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total Annual Value */}
            {sections.showTotalAnnualValue && totalAnnualValue > 0 && (
              <div className="relative rounded-3xl p-12 text-center overflow-hidden shadow-2xl" style={{
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)'
              }}>
                <div className="relative z-10">
                  <p className="text-xl font-bold uppercase tracking-wider mb-4 text-emerald-100">Total Annual Value</p>
                  <div className="h-1 w-32 bg-white/30 rounded mx-auto mb-6"></div>
                  <p className="text-6xl md:text-7xl font-bold text-white">${totalAnnualValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SELECTED PRODUCTS - Match UI Style Exactly */}
      {sections.solutionOverview && selectedProducts.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-4xl font-bold text-dark-orange mb-8">Solution Overview</h2>

          <div className="space-y-6">
            {selectedProducts.map((product) => {
              const customFeatures = opportunityData.customProductFeatures[product.id] || product.features
              const productImage = imageSettings.product_images[product.id as keyof typeof imageSettings.product_images]

              return (
                <div
                  key={product.id}
                  className="relative rounded-2xl overflow-hidden shadow-xl border-2 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                  style={{
                    background: 'linear-gradient(135deg, #ED8B00 0%, #D64303 100%)',
                    borderColor: '#D64303'
                  }}
                >
                  {/* Product Image Section */}
                  {productImage ? (
                    <div className="relative w-full h-64 md:h-80">
                      <Image
                        src={productImage}
                        alt={product.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      {/* Gradient overlay for smooth transition to content */}
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-dark-orange/80"></div>
                    </div>
                  ) : (
                    /* Elegant placeholder when no image */
                    <div className="relative w-full h-64 md:h-80 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border-b-2 border-white/20 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                          <ImageIcon size={36} className="text-white/60" />
                        </div>
                        <p className="text-white/40 text-sm font-medium">Product Image</p>
                      </div>
                    </div>
                  )}

                  {/* Product Content */}
                  <div className="p-8">
                    <h3 className="text-3xl font-bold mb-4 text-white">{product.name}</h3>
                    <p className="text-lg mb-6 text-white/95">{product.description}</p>

                    <div className="h-px w-full bg-white/20 my-6"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {customFeatures.map((feature, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                            <CheckCircle2 size={16} className="text-dark-orange" />
                          </div>
                          <p className="text-base text-white font-medium">{feature}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* COVERAGE ANALYSIS */}
      {sections.coverageAnalysis && addresses.length > 0 && (
        <section className="bg-gradient-to-br from-gray-50 to-white py-16 border-y border-gray-200">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-4xl font-bold text-dark-orange mb-8">Coverage Analysis</h2>

            <div className="space-y-8">
              {addresses.map((address, index) => (
                address.geocoded && address.lat && address.lng && (
                  <div key={index} className="card overflow-hidden shadow-lg">
                    <div className="relative rounded-2xl p-6 mb-6 overflow-hidden" style={{
                      background: 'linear-gradient(135deg, #ED8B00 0%, #D64303 100%)'
                    }}>
                      <div className="flex items-center gap-3 mb-6">
                        <MapPin size={24} className="text-white" />
                        <h3 className="text-2xl font-bold text-white">{address.formattedAddress || address.address}</h3>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-white/90 text-sm font-semibold uppercase tracking-wider mb-2">Within 5 miles</p>
                          <p className="text-4xl font-bold text-white">{address.coverage.within5mi}</p>
                          <p className="text-white/90 text-sm">locations</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-white/90 text-sm font-semibold uppercase tracking-wider mb-2">Within 10 miles</p>
                          <p className="text-4xl font-bold text-white">{address.coverage.within10mi}</p>
                          <p className="text-white/90 text-sm">locations</p>
                        </div>
                      </div>
                    </div>

                    <div className="relative h-96 rounded-xl overflow-hidden border-2 border-gray-200">
                      <MapComponent
                        center={{ lat: address.lat, lng: address.lng }}
                        stores={address.nearbyStores}
                        height={384}
                      />
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TERMS AND CONDITIONS */}
      {sections.termsConditions && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-4xl font-bold text-dark-orange mb-8">Terms and Conditions</h2>

          <div className="card">
            <div className="space-y-4">
              {[
                'This proposal is valid for 30 days from the date of issue.',
                'Pricing is subject to change based on fuel market conditions.',
                'Customer agrees to Circle K Pro standard terms of service.',
                'Implementation timeline is subject to site surveys and approval.',
                'All fees and charges are exclusive of applicable taxes.'
              ].map((term, index) => (
                <div key={index} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-brand-orange to-dark-orange flex items-center justify-center text-white text-sm font-bold">
                    {index + 1}
                  </div>
                  <p className="text-base text-gray-700 pt-0.5">{term}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER - Keep Perfect As Is */}
      <footer className="bg-gradient-to-br from-off-black to-gray-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div>
              <Image
                src="/circle-k-pro-logo.png"
                alt="Circle K Pro"
                width={160}
                height={48}
                className="w-40 h-auto brightness-0 invert mb-4"
              />
              <p className="text-gray-400">Professional Fleet Fuel Solutions</p>
            </div>

            <div className="text-center md:text-right">
              <p className="text-gray-400 text-sm mb-4">This proposal is confidential and intended solely for {opportunityData.customerName}</p>
              <p className="text-gray-500 text-xs">© {new Date().getFullYear()} Circle K Pro. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function ProposalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposal...</p>
        </div>
      </div>
    }>
      <ProposalContent />
    </Suspense>
  )
}
