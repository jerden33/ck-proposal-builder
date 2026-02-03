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
        console.log('[ProposalPage] Image settings loaded:', images)
        console.log('[ProposalPage] Hero image URL:', images.hero_image)
        console.log('[ProposalPage] Product images:', images.product_images)

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
    <div className="min-h-screen bg-gradient-to-b from-white via-[#FFF7ED]/30 to-white">
      {/* HERO IMAGE - Full prominence */}
      {imageSettings.hero_image && (
        <section className="relative overflow-hidden border-b-4 border-[#ED8B00]">
          <div className="relative h-[400px]">
            <Image
              src={imageSettings.hero_image}
              alt="Hero"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        </section>
      )}

      {/* TITLE SECTION - Below hero, above content */}
      <section className="bg-gradient-to-b from-[#FFF7ED] to-white py-12 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-8">
          <h1 className="text-4xl font-bold text-[#D64303] mb-2">
            Fleet Fuel Solutions Proposal
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Prepared for {opportunityData.customerName}
          </p>
          <p className="text-sm text-gray-500">
            {today} • Circle K Pro
          </p>
        </div>
      </section>

      {/* EXECUTIVE SUMMARY */}
      {sections.executiveSummary && (
        <section className="max-w-6xl mx-auto px-8 py-16">
          <h2 className="text-3xl font-bold text-[#D64303] mb-2 border-l-4 border-[#ED8B00] pl-4">
            Executive Summary
          </h2>
          <p className="text-gray-600 mb-8 pl-4">
            Comprehensive fleet fuel solutions tailored for your business
          </p>

          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-lg text-gray-700 leading-relaxed">
              Circle K Pro is pleased to present this comprehensive fleet fuel solutions proposal tailored to meet {opportunityData.customerName}'s operational needs. Our program offers significant cost savings, nationwide coverage at over 6,000 locations, and streamlined fleet management tools.
            </p>
          </div>

          {/* Fleet Overview Stats - Light and Airy */}
          {(opportunityData.fleetSize || opportunityData.monthlyGallons) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {opportunityData.fleetSize && (
                <div className="bg-[#F9FAFB] rounded-xl border border-gray-200 p-6 text-center transition-all hover:shadow-md">
                  <div className="text-4xl font-bold text-[#ED8B00] mb-2">
                    {opportunityData.fleetSize}
                  </div>
                  <div className="text-sm text-gray-600 uppercase tracking-wide">
                    Fleet Vehicles
                  </div>
                </div>
              )}

              {opportunityData.monthlyGallons && (
                <div className="bg-[#F9FAFB] rounded-xl border border-gray-200 p-6 text-center transition-all hover:shadow-md">
                  <div className="text-4xl font-bold text-[#ED8B00] mb-2">
                    {Number(opportunityData.monthlyGallons).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 uppercase tracking-wide">
                    Gallons Per Month
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PRICING SECTION - SUBTLE GREEN */}
      {(sections.showEstimatedSavings || sections.showPerGallonDiscount || sections.showTotalAnnualValue) && monthlySavings > 0 && (
        <section className="bg-gradient-to-b from-[#F9FAFB] to-white py-16 border-y border-gray-200">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="text-3xl font-bold text-[#D64303] mb-2 border-l-4 border-[#ED8B00] pl-4">
              Pricing Breakdown
            </h2>
            <p className="text-gray-600 mb-8 pl-4">
              Your estimated savings and program value
            </p>

            {/* Main Pricing Box - Subtle Green */}
            {sections.showEstimatedSavings && (
              <div className="bg-gradient-to-b from-[#F0FDF4] to-[#DCFCE7] rounded-xl border-2 border-[#86EFAC] border-l-4 border-l-[#10b981] p-8 mb-8" style={{ boxShadow: 'var(--shadow-md)' }}>
                <h3 className="text-2xl font-bold mb-6 text-[#065F46]">
                  Estimated Fuel Savings
                </h3>

                <div className="space-y-4">
                  {/* Per Gallon Discount */}
                  <div className="flex justify-between items-baseline border-b border-[#86EFAC]/30 pb-3">
                    <span className="text-gray-700 font-medium">
                      Per Gallon Discount
                    </span>
                    <span className="text-3xl font-bold text-[#059669]">
                      {perGallonDiscount.toFixed(2)}¢
                    </span>
                  </div>

                  {/* Monthly Gallons */}
                  <div className="flex justify-between items-baseline border-b border-[#86EFAC]/30 pb-3">
                    <span className="text-gray-700 font-medium">
                      Monthly Gallons
                    </span>
                    <span className="text-3xl font-bold text-[#059669]">
                      {Number(monthlyGallons).toLocaleString()}
                    </span>
                  </div>

                  {/* Monthly Savings */}
                  <div className="flex justify-between items-baseline border-b border-[#86EFAC]/30 pb-3">
                    <span className="text-gray-700 font-medium">
                      Estimated Monthly Savings
                    </span>
                    <span className="text-3xl font-bold text-[#059669]">
                      ${monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>

                  {/* Annual Savings - Highlighted */}
                  <div className="flex justify-between items-baseline pt-4">
                    <span className="text-lg font-bold text-[#065F46]">
                      Annual Fuel Savings
                    </span>
                    <span className="text-5xl font-bold text-[#059669]">
                      ${annualFuelSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Savings */}
            {sections.showAdditionalSavings && opportunityData.additionalSavings && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8" style={{ boxShadow: 'var(--shadow-md)' }}>
                <h3 className="text-2xl font-bold text-[#D64303] mb-6">Additional Cost Savings</h3>
                <div className="space-y-4">
                  {opportunityData.additionalSavings.split('\n').filter(line => line.trim()).map((item, index) => (
                    <div key={index} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0">
                      <svg className="w-5 h-5 text-[#10b981] mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <p className="text-base text-gray-700">{item.trim()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total Annual Value - Emphasized */}
            {sections.showTotalAnnualValue && totalAnnualValue > 0 && (
              <div className="bg-gradient-to-br from-[#DCFCE7] to-[#86EFAC]/30 rounded-xl border-2 border-[#10b981] p-12 text-center" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <p className="text-xl font-bold uppercase tracking-wider mb-4 text-[#065F46]">
                  Total Annual Value
                </p>
                <p className="text-6xl md:text-7xl font-bold text-[#059669]">
                  ${totalAnnualValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SOLUTION OVERVIEW - WHITE CARDS WITH ORANGE ACCENTS */}
      {sections.solutionOverview && selectedProducts.length > 0 && (
        <section className="max-w-6xl mx-auto px-8 py-16">
          <h2 className="text-3xl font-bold text-[#D64303] mb-2 border-l-4 border-[#ED8B00] pl-4">
            Solution Overview
          </h2>
          <p className="text-gray-600 mb-8 pl-4">
            Comprehensive fuel card solutions for your fleet
          </p>

          <div className="space-y-6">
            {selectedProducts.map((product) => {
              const customFeatures = opportunityData.customProductFeatures[product.id] || product.features
              const productImage = imageSettings.product_images[product.id as keyof typeof imageSettings.product_images]

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl border-2 border-[#FED7AA] border-l-4 border-l-[#ED8B00] overflow-hidden transition-shadow hover:shadow-lg"
                  style={{ boxShadow: 'var(--shadow-md)' }}
                >
                  {/* Product Image or Placeholder - Full Width at Top with 16:9 Aspect Ratio */}
                  <div className="w-full aspect-[16/9] relative">
                    {productImage ? (
                      <Image
                        src={productImage}
                        alt={product.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      /* Elegant Placeholder - 600x338 equivalent, 16:9 ratio */
                      <div className="w-full h-full bg-gradient-to-br from-[#FFF7ED] to-[#FFEDD5] border-b-2 border-dashed border-[#FED7AA] flex items-center justify-center">
                        <div className="text-center">
                          <ImageIcon size={48} className="text-[#ED8B00]/40 mx-auto mb-3" />
                          <p className="text-sm text-gray-400 font-medium">Product Image</p>
                          <p className="text-xs text-gray-400 mt-1">600×338px (16:9 ratio)</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Product Content */}
                  <div className="p-8">
                    {/* Product Name - Orange */}
                    <h3 className="text-2xl font-bold mb-2 text-[#D64303]">
                      {product.name}
                    </h3>

                    {/* Description - Medium Gray */}
                    <p className="text-gray-600 mb-6">
                      {product.description}
                    </p>

                    {/* Features - Checkmarks */}
                    <ul className="space-y-3">
                      {customFeatures.map((feature, index) => (
                        <li key={index} className="flex items-start text-gray-700">
                          <svg className="w-5 h-5 text-[#ED8B00] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* COVERAGE ANALYSIS */}
      {sections.coverageAnalysis && addresses.length > 0 && (
        <section className="bg-gradient-to-b from-[#F9FAFB] to-white py-16 border-y border-gray-200">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="text-3xl font-bold text-[#D64303] mb-2 border-l-4 border-[#ED8B00] pl-4">
              Coverage Analysis
            </h2>
            <p className="text-gray-600 mb-8 pl-4">
              Circle K locations near your operations
            </p>

            <div className="space-y-8">
              {addresses.map((address, index) => (
                address.geocoded && address.lat && address.lng && (
                  <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
                    {/* Location Header */}
                    <div className="bg-gradient-to-r from-[#FFF7ED] to-[#FFEDD5] p-6 border-b-2 border-[#FED7AA]">
                      <div className="flex items-center gap-3 mb-4">
                        <MapPin size={24} className="text-[#D64303]" />
                        <h3 className="text-xl font-bold text-[#101820]">{address.formattedAddress || address.address}</h3>
                      </div>

                      {/* Coverage Stats - Side by Side */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-[#FED7AA] p-4 text-center">
                          <div className="text-4xl font-bold text-[#ED8B00] mb-1">
                            {address.coverage.within2mi}
                          </div>
                          <div className="text-sm text-gray-600 uppercase tracking-wide">
                            Within 2 Miles
                          </div>
                        </div>
                        <div className="bg-white rounded-xl border border-[#FED7AA] p-4 text-center">
                          <div className="text-4xl font-bold text-[#ED8B00] mb-1">
                            {address.coverage.within10mi}
                          </div>
                          <div className="text-sm text-gray-600 uppercase tracking-wide">
                            Within 10 Miles
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Map */}
                    <div className="relative h-96 bg-gray-50">
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
        <section className="max-w-6xl mx-auto px-8 py-16">
          <h2 className="text-3xl font-bold text-[#D64303] mb-2 border-l-4 border-[#ED8B00] pl-4">
            Terms and Conditions
          </h2>
          <p className="text-gray-600 mb-8 pl-4">
            Standard terms for this proposal
          </p>

          <div className="bg-white rounded-xl border border-gray-200 p-8" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="space-y-4">
              {[
                'This proposal is valid for 30 days from the date of issue.',
                'Pricing is subject to change based on fuel market conditions.',
                'Customer agrees to Circle K Pro standard terms of service.',
                'Implementation timeline is subject to site surveys and approval.',
                'All fees and charges are exclusive of applicable taxes.'
              ].map((term, index) => (
                <div key={index} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#ED8B00] flex items-center justify-center text-white text-sm font-bold">
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
