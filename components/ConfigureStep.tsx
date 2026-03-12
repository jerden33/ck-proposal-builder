'use client'

import { ProposalSections, OpportunityData } from '@/lib/types'
import { Check } from 'lucide-react'

interface ConfigureStepProps {
  sections: ProposalSections
  toggleSection: (section: keyof ProposalSections) => void
  opportunityData: OpportunityData
}

const sectionList = [
  { key: 'executiveSummary' as keyof ProposalSections, name: 'Executive summary', description: 'High-level overview and value proposition', recommended: true },
  { key: 'aboutCircleK' as keyof ProposalSections, name: 'About Circle K Pro', description: 'Company background and capabilities', recommended: true },
  { key: 'solutionOverview' as keyof ProposalSections, name: 'Solution overview', description: 'Detailed product and service information', recommended: true },
  { key: 'coverageAnalysis' as keyof ProposalSections, name: 'Coverage analysis', description: 'Maps and location data for customer addresses', recommended: true },
  { key: 'pricingTable' as keyof ProposalSections, name: 'Pricing table', description: 'Cost breakdown and pricing options', recommended: false },
  { key: 'implementationTimeline' as keyof ProposalSections, name: 'Implementation timeline', description: 'Project phases and milestones', recommended: false },
  { key: 'caseStudies' as keyof ProposalSections, name: 'Case studies', description: 'Customer success stories and testimonials', recommended: false },
  { key: 'termsConditions' as keyof ProposalSections, name: 'Terms and conditions', description: 'Legal terms and agreement details', recommended: true },
  { key: 'signaturePage' as keyof ProposalSections, name: 'Signature page', description: 'Authorization and sign-off section', recommended: true }
]

export function ConfigureStep({ sections, toggleSection, opportunityData }: ConfigureStepProps) {
  const selectedCount = Object.values(sections).filter(Boolean).length

  // Check which pricing options are available based on data
  const hasPerGallonDiscount = opportunityData.perGallonDiscount && parseFloat(opportunityData.perGallonDiscount) > 0
  const hasMonthlyGallons = opportunityData.monthlyGallons && parseFloat(opportunityData.monthlyGallons) > 0
  const hasAdditionalSavings = opportunityData.additionalSavings && opportunityData.additionalSavings.trim().length > 0
  const canCalculateSavings = hasPerGallonDiscount && hasMonthlyGallons

  return (
    <div className="space-y-6 fade-in">
      <div className="card">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Configure Proposal</h2>
            <p className="text-gray-600">Select which sections to include in your proposal</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Selected</div>
            <div className="text-2xl font-bold text-brand-orange">{selectedCount}/{sectionList.length}</div>
          </div>
        </div>
        
        <div className="space-y-3">
          {sectionList.map(section => (
            <div
              key={section.key}
              onClick={() => toggleSection(section.key)}
              className={`section-toggle ${sections[section.key] ? 'active' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mt-0.5 ${
                  sections[section.key]
                    ? 'bg-dark-orange border-dark-orange' 
                    : 'border-ck-grey'
                }`}>
                  {sections[section.key] && (
                    <Check size={16} className="text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-off-black">{section.name}</h3>
                    {section.recommended && (
                      <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange text-xs font-medium rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{section.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Pricing Information</h2>
          <p className="text-gray-600">Choose which pricing details to include in the proposal</p>
        </div>

        <div className="space-y-3">
          {/* Per gallon discount */}
          <div
            onClick={() => hasPerGallonDiscount && toggleSection('showPerGallonDiscount')}
            className={`section-toggle ${sections.showPerGallonDiscount ? 'active' : ''} ${!hasPerGallonDiscount ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mt-0.5 ${
                sections.showPerGallonDiscount
                  ? 'bg-dark-orange border-dark-orange'
                  : 'border-ck-grey'
              }`}>
                {sections.showPerGallonDiscount && (
                  <Check size={16} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-off-black">Show per gallon discount</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {hasPerGallonDiscount
                    ? `Display the ${parseFloat(opportunityData.perGallonDiscount).toFixed(2)}¢ per gallon savings`
                    : 'Enter per gallon discount in Step 1 to enable'}
                </p>
              </div>
            </div>
          </div>

          {/* Estimated fuel savings */}
          <div
            onClick={() => canCalculateSavings && toggleSection('showEstimatedSavings')}
            className={`section-toggle ${sections.showEstimatedSavings ? 'active' : ''} ${!canCalculateSavings ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mt-0.5 ${
                sections.showEstimatedSavings
                  ? 'bg-dark-orange border-dark-orange'
                  : 'border-ck-grey'
              }`}>
                {sections.showEstimatedSavings && (
                  <Check size={16} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-off-black">Show estimated fuel savings</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {canCalculateSavings
                    ? 'Display calculated monthly and annual fuel cost savings'
                    : 'Enter both per gallon discount and monthly gallons in Step 1 to enable'}
                </p>
              </div>
            </div>
          </div>

          {/* Additional cost savings */}
          <div
            onClick={() => hasAdditionalSavings && toggleSection('showAdditionalSavings')}
            className={`section-toggle ${sections.showAdditionalSavings ? 'active' : ''} ${!hasAdditionalSavings ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mt-0.5 ${
                sections.showAdditionalSavings
                  ? 'bg-dark-orange border-dark-orange'
                  : 'border-ck-grey'
              }`}>
                {sections.showAdditionalSavings && (
                  <Check size={16} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-off-black">Show additional cost savings</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {hasAdditionalSavings
                    ? 'Display itemized list of additional savings'
                    : 'Enter additional cost savings in Step 1 to enable'}
                </p>
              </div>
            </div>
          </div>

          {/* Total annual value */}
          <div
            onClick={() => canCalculateSavings && toggleSection('showTotalAnnualValue')}
            className={`section-toggle ${sections.showTotalAnnualValue ? 'active' : ''} ${!canCalculateSavings ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all mt-0.5 ${
                sections.showTotalAnnualValue
                  ? 'bg-dark-orange border-dark-orange'
                  : 'border-ck-grey'
              }`}>
                {sections.showTotalAnnualValue && (
                  <Check size={16} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-off-black">Show total annual value</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {canCalculateSavings
                    ? 'Display combined total annual savings'
                    : 'Enter both per gallon discount and monthly gallons in Step 1 to enable'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-gradient-to-br from-orange-50 to-white border-brand-orange/30">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center">
            <span className="text-white text-lg">💡</span>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Customization tip</h3>
            <p className="text-sm text-gray-700">
              Recommended sections are pre-selected for a complete proposal. You can customize based on your opportunity and add pricing tables or case studies as needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
