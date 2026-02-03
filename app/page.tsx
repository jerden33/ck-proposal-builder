'use client'

import { useState, useEffect } from 'react'
import { OpportunityStep } from '@/components/OpportunityStep'
import { CoverageStep } from '@/components/CoverageStep'
import { ConfigureStep } from '@/components/ConfigureStep'
import { GenerateStep } from '@/components/GenerateStep'
import { PreviewPanel } from '@/components/PreviewPanel'
import { StepIndicator } from '@/components/StepIndicator'
import { Navbar } from '@/components/Navbar'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { products as defaultProducts, OpportunityData, Address, ProposalSections, Product } from '@/lib/types'
import { getProductsConfig } from '@/lib/supabase/queries'

export default function Home() {
  const [products, setProducts] = useState<Product[]>(defaultProducts)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [opportunityData, setOpportunityData] = useState<OpportunityData>({
    customerName: '',
    industry: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    selectedProducts: [],
    customProductFeatures: {},
    fleetSize: '',
    monthlyGallons: '',
    closeDate: '',
    notes: '',
    perGallonDiscount: '',
    additionalSavings: ''
  })
  
  const [addresses, setAddresses] = useState<Address[]>([])
  const [proposalSections, setProposalSections] = useState<ProposalSections>({
    executiveSummary: true,
    aboutCircleK: true,
    solutionOverview: true,
    coverageAnalysis: true,
    pricingTable: false,
    implementationTimeline: false,
    caseStudies: false,
    termsConditions: true,
    signaturePage: true,
    showPerGallonDiscount: false,
    showEstimatedSavings: false,
    showAdditionalSavings: false,
    showTotalAnnualValue: false
  })

  const steps = [
    { number: 1, name: 'Opportunity' },
    { number: 2, name: 'Coverage' },
    { number: 3, name: 'Configure' },
    { number: 4, name: 'Generate' }
  ]

  useEffect(() => {
    async function loadProductsFromDB() {
      try {
        const productsConfig = await getProductsConfig()
        if (productsConfig.length > 0) {
          const mappedProducts: Product[] = productsConfig.map(config => ({
            id: config.id,
            name: config.name,
            description: config.description,
            features: config.default_features
          }))
          setProducts(mappedProducts)
        }
      } catch (error) {
        console.error('Error loading products:', error)
        // Keep using default products on error
      } finally {
        setLoadingProducts(false)
      }
    }

    loadProductsFromDB()
  }, [])

  const updateOpportunity = (field: keyof OpportunityData, value: string | string[]) => {
    setOpportunityData(prev => ({ ...prev, [field]: value }))
  }

  const toggleProduct = (productId: string) => {
    setOpportunityData(prev => {
      const isSelected = prev.selectedProducts.includes(productId)

      if (isSelected) {
        // Remove product and its custom features
        const { [productId]: _, ...restFeatures } = prev.customProductFeatures
        return {
          ...prev,
          selectedProducts: prev.selectedProducts.filter(id => id !== productId),
          customProductFeatures: restFeatures
        }
      } else {
        // Add product and initialize with default features
        const product = products.find(p => p.id === productId)
        return {
          ...prev,
          selectedProducts: [...prev.selectedProducts, productId],
          customProductFeatures: {
            ...prev.customProductFeatures,
            [productId]: product ? [...product.features] : []
          }
        }
      }
    })
  }

  const updateProductFeatures = (productId: string, features: string[]) => {
    setOpportunityData(prev => ({
      ...prev,
      customProductFeatures: {
        ...prev.customProductFeatures,
        [productId]: features
      }
    }))
  }

  const addProductFeature = (productId: string) => {
    setOpportunityData(prev => ({
      ...prev,
      customProductFeatures: {
        ...prev.customProductFeatures,
        [productId]: [...(prev.customProductFeatures[productId] || []), '']
      }
    }))
  }

  const removeProductFeature = (productId: string, index: number) => {
    setOpportunityData(prev => ({
      ...prev,
      customProductFeatures: {
        ...prev.customProductFeatures,
        [productId]: prev.customProductFeatures[productId].filter((_, i) => i !== index)
      }
    }))
  }

  const updateProductFeature = (productId: string, index: number, value: string) => {
    setOpportunityData(prev => ({
      ...prev,
      customProductFeatures: {
        ...prev.customProductFeatures,
        [productId]: prev.customProductFeatures[productId].map((f, i) => i === index ? value : f)
      }
    }))
  }

  const addAddress = () => {
    setAddresses(prev => [...prev, { 
      id: Date.now(), 
      address: '',
      geocoded: false,
      nearbyStores: [],
      coverage: { within2mi: 0, within10mi: 0 }
    }])
  }

  const removeAddress = (id: number) => {
    setAddresses(prev => prev.filter(addr => addr.id !== id))
  }

  const updateAddress = (id: number, value: string) => {
    setAddresses(prev => prev.map(addr => 
      addr.id === id ? { ...addr, address: value } : addr
    ))
  }

  const analyzeAddress = async (id: number) => {
    const address = addresses.find(a => a.id === id)
    if (!address || !address.address) return

    // Set analyzing state
    setAddresses(prev => prev.map(addr =>
      addr.id === id ? { ...addr, analyzing: true } : addr
    ))

    try {
      // Import services
      const { geocodeAddress } = await import('@/lib/mapbox')
      const { loadStoreData, findStoresWithinRadius, getCoverageStats } = await import('@/lib/stores')

      // Load store data if not already loaded
      await loadStoreData()

      // Geocode the address
      const result = await geocodeAddress(address.address)
      
      if (result) {
        // Find nearby stores - get stores within 200 miles for comprehensive map display
        const nearbyStores = findStoresWithinRadius(result.coordinates, 200)
        console.log(`[Coverage Analysis] Found ${nearbyStores.length} stores within 200 miles`)

        // Add distance to each store and limit to nearest 100
        const storesWithDistance = nearbyStores
          .map(store => ({
            ...store,
            distance: calculateDistanceHelper(result.coordinates, store.coordinates)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 100)

        console.log(`[Coverage Analysis] Storing ${storesWithDistance.length} nearest stores for map display`)
        console.log(`[Coverage Analysis] Distance range: ${storesWithDistance[0]?.distance.toFixed(2)} mi to ${storesWithDistance[storesWithDistance.length - 1]?.distance.toFixed(2)} mi`)

        // Get coverage stats
        const stats = getCoverageStats(result.coordinates)
        console.log(`[Coverage Analysis] Coverage stats:`, stats)

        // Count stores in nearbyStores within specific distances for verification
        const storesIn2mi = storesWithDistance.filter(s => s.distance <= 2).length
        const storesIn10mi = storesWithDistance.filter(s => s.distance <= 10).length
        console.log(`[Coverage Analysis] Verification - stores in display list: ${storesIn2mi} within 2mi, ${storesIn10mi} within 10mi`)

        // Update address with results
        setAddresses(prev => prev.map(addr =>
          addr.id === id ? {
            ...addr,
            geocoded: true,
            lat: result.coordinates.lat,
            lng: result.coordinates.lng,
            formattedAddress: result.formattedAddress,
            nearbyStores: storesWithDistance,
            coverage: {
              within2mi: stats.within2mi,
              within10mi: stats.within10mi
            },
            analyzing: false
          } : addr
        ))
      } else {
        // Geocoding failed
        console.error('Geocoding failed for address:', address.address)
        alert(`Unable to find location for "${address.address}". Try:\n\n• Using the full address format: "123 Main St, City, ST 12345"\n• Checking spelling of street name and city\n• Using numeric street addresses when possible\n\nIf the address is correct, Mapbox may not have it in their database.`)
        setAddresses(prev => prev.map(addr =>
          addr.id === id ? { ...addr, analyzing: false } : addr
        ))
      }
    } catch (error) {
      console.error('Error analyzing address:', error)
      alert('Error analyzing address. Please try again.')
      setAddresses(prev => prev.map(addr =>
        addr.id === id ? { ...addr, analyzing: false } : addr
      ))
    }
  }

  // Helper function to calculate distance
  const calculateDistanceHelper = (coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }): number => {
    const R = 3959 // Earth's radius in miles
    const dLat = toRad(coord2.lat - coord1.lat)
    const dLng = toRad(coord2.lng - coord1.lng)
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const toRad = (degrees: number): number => {
    return degrees * (Math.PI / 180)
  }

  const toggleSection = (section: keyof ProposalSections) => {
    setProposalSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const canProgress = () => {
    switch (currentStep) {
      case 1:
        return opportunityData.customerName && opportunityData.selectedProducts.length > 0
      case 2:
        return true // Coverage is optional
      case 3:
        return true // At least some sections selected
      default:
        return true
    }
  }

  if (loadingProducts) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-off-white to-white">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-10 fade-in">
            <h1 className="text-5xl font-bold text-off-black mb-3 tracking-tight">
            Proposal builder
          </h1>
          <p className="text-lg text-gray-600">
            Configure and generate branded proposals for your opportunities
          </p>
        </header>

        {/* Step Indicator */}
        <StepIndicator steps={steps} currentStep={currentStep} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              {currentStep === 1 && (
                <OpportunityStep
                  data={opportunityData}
                  products={products}
                  updateOpportunity={updateOpportunity}
                  toggleProduct={toggleProduct}
                  addProductFeature={addProductFeature}
                  removeProductFeature={removeProductFeature}
                  updateProductFeature={updateProductFeature}
                />
              )}
              
              {currentStep === 2 && (
                <CoverageStep
                  addresses={addresses}
                  addAddress={addAddress}
                  removeAddress={removeAddress}
                  updateAddress={updateAddress}
                  analyzeAddress={analyzeAddress}
                />
              )}
              
              {currentStep === 3 && (
                <ConfigureStep
                  sections={proposalSections}
                  toggleSection={toggleSection}
                  opportunityData={opportunityData}
                />
              )}
              
              {currentStep === 4 && (
                <GenerateStep
                  opportunityData={opportunityData}
                  addresses={addresses}
                  sections={proposalSections}
                  products={products}
                />
              )}
            </div>
          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <PreviewPanel 
              opportunityData={opportunityData}
              addresses={addresses}
              products={products}
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-10 pb-20">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="btn-secondary flex items-center gap-2"
          >
            <ChevronLeft size={20} />
            Previous
          </button>
          
          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep(Math.min(4, currentStep + 1))}
              disabled={!canProgress()}
              className="btn-primary flex items-center gap-2"
            >
              Next
              <ChevronRight size={20} />
            </button>
          ) : (
            <div className="text-sm text-gray-500">
              Ready to generate
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
