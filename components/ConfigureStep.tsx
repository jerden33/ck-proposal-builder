'use client'

import { ProposalSections } from '@/lib/types'
import { Check } from 'lucide-react'

interface ConfigureStepProps {
  sections: ProposalSections
  toggleSection: (section: keyof ProposalSections) => void
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

export function ConfigureStep({ sections, toggleSection }: ConfigureStepProps) {
  const selectedCount = Object.values(sections).filter(Boolean).length

  return (
    <div className="space-y-6 fade-in">
      <div className="card">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Configure proposal</h2>
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
