'use client'

import { useState } from 'react'
import { OpportunityStep } from '@/components/OpportunityStep'
import { CoverageStep } from '@/components/CoverageStep'
import { ConfigureStep } from '@/components/ConfigureStep'
import { GenerateStep } from '@/components/GenerateStep'
import { PreviewPanel } from '@/components/PreviewPanel'
import { StepIndicator } from '@/components/StepIndicator'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { products, OpportunityData, Address, ProposalSections } from '@/lib/types'

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1)
  const [opportunityData, setOpportunityData] = useState<OpportunityData>({
    customerName: '',
    industry: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    selectedProducts: [],
    fleetSize: '',
    monthlyGallons: '',
    closeDate: '',
    notes: ''
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
    signaturePage: true
  })

  const steps = [
    { number: 1, name: 'Opportunity' },
    { number: 2, name: 'Coverage' },
    { number: 3, name: 'Configure' },
    { number: 4, name: 'Generate' }
  ]

  const updateOpportunity = (field: keyof OpportunityData, value: string | string[]) => {
    setOpportunityData(prev => ({ ...prev, [field]: value }))
  }

  const toggleProduct = (productId: string) => {
    setOpportunityData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.includes(productId)
        ? prev.selectedProducts.filter(id => id !== productId)
        : [...prev.selectedProducts, productId]
    }))
  }

  const addAddress = () => {
    setAddresses(prev => [...prev, { 
      id: Date.now(), 
      address: '', 
      geocoded: false,
      nearbyStores: [],
      coverage: { within5mi: 0, within10mi: 0 }
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

  return (
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
                />
              )}
              
              {currentStep === 2 && (
                <CoverageStep
                  addresses={addresses}
                  addAddress={addAddress}
                  removeAddress={removeAddress}
                  updateAddress={updateAddress}
                />
              )}
              
              {currentStep === 3 && (
                <ConfigureStep
                  sections={proposalSections}
                  toggleSection={toggleSection}
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
  )
}
