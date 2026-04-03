'use client'

import { useState } from 'react'
import { OpportunityData, Address, ProposalSections, products as productList } from '@/lib/types'
import { FileText, CheckCircle2, Share2, Copy, ExternalLink, FileDown, RefreshCw } from 'lucide-react'

interface GenerateStepProps {
  opportunityData: OpportunityData
  addresses: Address[]
  sections: ProposalSections
  products: typeof productList
}

export function GenerateStep({ opportunityData, addresses, sections, products }: GenerateStepProps) {
  const [generating, setGenerating] = useState(false)
  const [proposalUrl, setProposalUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedProductDetails = products.filter(p =>
    opportunityData.selectedProducts.includes(p.id)
  )

  const selectedSectionCount = Object.values(sections).filter(Boolean).length

  const handleGenerateProposal = async () => {
    setGenerating(true)
    try {
      // Import the createProposal function dynamically
      const { createProposal } = await import('@/lib/supabase/queries')

      // Save proposal to database
      const proposalData = {
        opportunityData,
        addresses,
        sections,
        products
      }

      const result = await createProposal(proposalData)

      if (!result) {
        throw new Error('Failed to create proposal')
      }

      // Create shareable URL with clean ID
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const proposalUrl = `${baseUrl}/proposal?id=${result.id}`
      setProposalUrl(proposalUrl)
    } catch (error) {
      console.error('Error generating proposal:', error)
      alert('Error generating proposal. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyLink = async () => {
    if (proposalUrl) {
      await navigator.clipboard.writeText(proposalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenProposal = () => {
    if (proposalUrl) {
      window.open(proposalUrl, '_blank')
    }
  }

  const loadLogoAsBase64 = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } else {
          reject(new Error('Failed to get canvas context'))
        }
      }
      img.onerror = () => reject(new Error('Failed to load logo'))
      img.src = '/circle-k-pro-logo.png'
    })
  }

  const handleDownloadPDF = async () => {
    setGenerating(true)
    try {
      let logoBase64: string | undefined
      try {
        logoBase64 = await loadLogoAsBase64()
      } catch (logoError) {
        console.warn('Could not load logo:', logoError)
      }

      const { generateProposalPDF } = await import('@/lib/pdf')
      await generateProposalPDF(opportunityData, addresses, sections, products, logoBase64)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Error generating PDF. Please try again.')
    } finally {
      setGenerating(false)
    }
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
            <p className="text-gray-600">Create a shareable proposal link or download as PDF</p>
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

        {!proposalUrl ? (
          <>
            <button
              onClick={handleGenerateProposal}
              disabled={generating}
              className="btn-primary w-full flex items-center justify-center gap-2 text-base py-4 mb-4"
            >
              {generating ? (
                <>
                  <div className="loading-spinner w-5 h-5 border-2"></div>
                  Creating proposal...
                </>
              ) : (
                <>
                  <Share2 size={20} />
                  Generate Shareable Proposal
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-base py-4"
            >
              <FileDown size={20} />
              Or Download as PDF
            </button>

            <p className="text-center text-sm text-gray-500 mt-5">
              Create a beautiful shareable web page or download a PDF with Circle K Pro styling
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-white border-2 border-green-500 rounded-xl p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1 text-green-900">Proposal Created!</h3>
                  <p className="text-green-700">Your shareable proposal is ready. Copy the link below to share with your customer.</p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-green-200 mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Shareable Link</p>
                <p className="text-sm text-gray-700 break-all font-mono bg-gray-50 p-3 rounded">{proposalUrl}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={handleCopyLink}
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <Copy size={18} />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>

                <button
                  onClick={handleOpenProposal}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  Open Proposal
                </button>
              </div>
            </div>

            <button
              onClick={() => setProposalUrl(null)}
              className="btn-secondary w-full"
            >
              Create Another Proposal
            </button>
          </div>
        )}
      </div>

      {!proposalUrl && (
        <div className="card bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <Share2 size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Modern Shareable Proposals</h3>
              <p className="text-sm text-gray-700 mb-3">
                Generate a beautiful web-based proposal that you can share via link. Your customers will see:
              </p>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                <li>• Professional, mobile-responsive design</li>
                <li>• Interactive coverage maps</li>
                <li>• Easy-to-read pricing breakdowns</li>
                <li>• Print-to-PDF capability</li>
                <li>• No login required for viewing</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
