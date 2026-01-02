'use client'

import { useState } from 'react'
import { OpportunityData, Address, ProposalSections, products as productList } from '@/lib/types'
import { FileText, Download, Eye, CheckCircle2 } from 'lucide-react'

interface GenerateStepProps {
  opportunityData: OpportunityData
  addresses: Address[]
  sections: ProposalSections
  products: typeof productList
}

export function GenerateStep({ opportunityData, addresses, sections, products }: GenerateStepProps) {
  const [generating, setGenerating] = useState(false)
  
  const selectedProductDetails = products.filter(p => 
    opportunityData.selectedProducts.includes(p.id)
  )

  const selectedSectionCount = Object.values(sections).filter(Boolean).length

  const handleGeneratePDF = async () => {
    setGenerating(true)
    try {
      const { generateProposalPDF } = await import('@/lib/pdf')
      await generateProposalPDF(opportunityData, addresses, sections, products)
      alert('PDF generated successfully!')
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Error generating PDF. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePreview = () => {
    alert('Preview feature coming soon - for now, generate the PDF to see the final output!')
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="card">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-brand-orange to-dark-orange flex items-center justify-center">
            <FileText size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">Generate proposal</h2>
            <p className="text-gray-600">Review your proposal summary and generate the final PDF</p>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-off-white to-white rounded-xl p-6 mb-6 border border-gray-100">
          <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-brand-orange" />
            Proposal summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</p>
              <p className="font-semibold text-off-black text-lg">{opportunityData.customerName || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Industry</p>
              <p className="font-semibold text-off-black text-lg">{opportunityData.industry || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fleet size</p>
              <p className="font-semibold text-off-black text-lg">
                {opportunityData.fleetSize ? `${opportunityData.fleetSize} vehicles` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Monthly gallons</p>
              <p className="font-semibold text-off-black text-lg">
                {opportunityData.monthlyGallons ? `${Number(opportunityData.monthlyGallons).toLocaleString()} gal` : '—'}
              </p>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Selected products</p>
            <div className="flex flex-wrap gap-2">
              {selectedProductDetails.map(product => (
                <span key={product.id} className="px-4 py-2 bg-dark-orange text-white rounded-full text-sm font-semibold">
                  {product.name}
                </span>
              ))}
              {selectedProductDetails.length === 0 && (
                <span className="text-gray-500 italic">No products selected</span>
              )}
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Coverage addresses</p>
              <p className="font-semibold text-off-black text-lg">
                {addresses.length} location{addresses.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Proposal sections</p>
              <p className="font-semibold text-off-black text-lg">
                {selectedSectionCount} of 9 sections
              </p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={handlePreview}
            className="btn-secondary flex items-center justify-center gap-2 text-base py-4"
          >
            <Eye size={20} />
            Preview proposal
          </button>
          
          <button 
            onClick={handleGeneratePDF}
            disabled={generating}
            className="btn-primary flex items-center justify-center gap-2 text-base py-4"
          >
            {generating ? (
              <>
                <div className="loading-spinner w-5 h-5 border-2"></div>
                Generating PDF...
              </>
            ) : (
              <>
                <Download size={20} />
                Generate PDF
              </>
            )}
          </button>
        </div>
        
        <p className="text-center text-sm text-gray-500 mt-5">
          Your professionally branded proposal will be generated as a PDF with Circle K Pro styling
        </p>
      </div>

      {/* Success Message Placeholder */}
      <div className="card bg-gradient-to-br from-green-50 to-white border-green-200">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle2 size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">Ready to generate</h3>
            <p className="text-sm text-gray-700">
              Your proposal is configured and ready. Click "Generate PDF" to create your professional Circle K Pro proposal with coverage maps, product details, and selected sections.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
