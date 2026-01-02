// PDF generation service for Circle K Pro proposals

import jsPDF from 'jspdf'
import { OpportunityData, Address, ProposalSections, Product } from './types'
import { getStaticMapUrl } from './mapbox'

const BRAND_ORANGE = '#ED8B00'
const DARK_ORANGE = '#D64303'
const OFF_BLACK = '#101820'

export async function generateProposalPDF(
  opportunityData: OpportunityData,
  addresses: Address[],
  sections: ProposalSections,
  products: Product[]
): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  // Helper function to add new page
  const addNewPage = () => {
    pdf.addPage()
    yPos = margin
  }

  // Helper function to check if we need a new page
  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - margin) {
      addNewPage()
    }
  }

  // === COVER PAGE ===
  // Logo area (top right)
  pdf.setFontSize(24)
  pdf.setTextColor(BRAND_ORANGE)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CIRCLE K', pageWidth - margin - 50, 25)
  
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'normal')
  pdf.text('pro', pageWidth - margin - 10, 30)

  // Title
  yPos = 80
  pdf.setFontSize(32)
  pdf.setTextColor(OFF_BLACK)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Fleet Fuel Solutions', margin, yPos)
  
  yPos += 15
  pdf.setFontSize(24)
  pdf.text('Proposal', margin, yPos)

  // Customer info
  yPos += 30
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Prepared for ${opportunityData.customerName}`, margin, yPos)

  yPos += 15
  pdf.setFontSize(12)
  pdf.setTextColor('#666666')
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  pdf.text(today, margin, yPos)

  // Add decorative orange bar
  pdf.setFillColor(BRAND_ORANGE)
  pdf.rect(margin, yPos + 10, 60, 3, 'F')

  // Footer with Circle K Pro branding
  pdf.setFontSize(10)
  pdf.setTextColor('#999999')
  pdf.text('Circle K Pro | Confidential', margin, pageHeight - 15)

  // === PAGE 2: EXECUTIVE SUMMARY ===
  if (sections.executiveSummary) {
    addNewPage()
    
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Executive Summary', margin, yPos)
    
    yPos += 15
    pdf.setFontSize(11)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    
    const summaryText = `Circle K Pro is pleased to present this comprehensive fleet fuel solutions proposal tailored to meet ${opportunityData.customerName}'s operational needs. Our program offers significant cost savings, nationwide coverage at over 6,000 locations, and streamlined fleet management tools.`
    
    const splitSummary = pdf.splitTextToSize(summaryText, pageWidth - 2 * margin)
    pdf.text(splitSummary, margin, yPos)
    yPos += splitSummary.length * 6

    // Key Benefits
    yPos += 10
    checkPageBreak(50)
    
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Key Benefits', margin, yPos)
    
    yPos += 10
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'normal')
    
    const benefits = [
      'Save at least 10¢ per gallon automatically',
      '6,000+ Circle K locations nationwide',
      'Real-time fleet spend analytics',
      'Easy fuel card management',
      'No monthly fees on Fleet Card option',
      'U.S.-based customer support'
    ]
    
    benefits.forEach(benefit => {
      checkPageBreak(8)
      pdf.setTextColor(BRAND_ORANGE)
      pdf.text('✓', margin, yPos)
      pdf.setTextColor(OFF_BLACK)
      pdf.text(benefit, margin + 8, yPos)
      yPos += 7
    })

    // Fleet Details
    if (opportunityData.fleetSize || opportunityData.monthlyGallons) {
      yPos += 10
      checkPageBreak(40)
      
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Fleet Overview', margin, yPos)
      
      yPos += 10
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      
      if (opportunityData.fleetSize) {
        pdf.text(`Fleet Size: ${opportunityData.fleetSize} vehicles`, margin, yPos)
        yPos += 7
      }
      
      if (opportunityData.monthlyGallons) {
        pdf.text(`Monthly Fuel Usage: ${Number(opportunityData.monthlyGallons).toLocaleString()} gallons`, margin, yPos)
        yPos += 7
      }
    }
  }

  // === SELECTED PRODUCTS ===
  if (sections.solutionOverview) {
    addNewPage()
    
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Solution Overview', margin, yPos)
    
    yPos += 15
    
    const selectedProducts = products.filter(p => 
      opportunityData.selectedProducts.includes(p.id)
    )
    
    selectedProducts.forEach((product, index) => {
      checkPageBreak(50)
      
      if (index > 0) yPos += 10
      
      pdf.setFontSize(14)
      pdf.setTextColor(BRAND_ORANGE)
      pdf.setFont('helvetica', 'bold')
      pdf.text(product.name, margin, yPos)
      
      yPos += 8
      pdf.setFontSize(11)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')
      const descSplit = pdf.splitTextToSize(product.description, pageWidth - 2 * margin)
      pdf.text(descSplit, margin, yPos)
      yPos += descSplit.length * 6 + 5
      
      product.features.forEach(feature => {
        checkPageBreak(8)
        pdf.setTextColor(BRAND_ORANGE)
        pdf.text('•', margin + 5, yPos)
        pdf.setTextColor(OFF_BLACK)
        pdf.text(feature, margin + 10, yPos)
        yPos += 6
      })
    })
  }

  // === COVERAGE ANALYSIS ===
  if (sections.coverageAnalysis && addresses.length > 0) {
    addNewPage()
    
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Coverage Analysis', margin, yPos)
    
    yPos += 15
    
    for (const address of addresses) {
      if (!address.geocoded || !address.lat || !address.lng) continue
      
      checkPageBreak(120)
      
      // Address header
      pdf.setFontSize(12)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'bold')
      pdf.text(address.formattedAddress || address.address, margin, yPos)
      
      yPos += 10
      
      // Coverage stats
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Within 5 miles: ${address.coverage.within5mi} locations`, margin, yPos)
      yPos += 6
      pdf.text(`Within 10 miles: ${address.coverage.within10mi} locations`, margin, yPos)
      
      yPos += 15
      
      // Try to add static map image
      try {
        const mapUrl = getStaticMapUrl(
          { lat: address.lat, lng: address.lng },
          address.nearbyStores.map(s => s.coordinates),
          600,
          400
        )
        
        if (mapUrl) {
          // Add map image
          checkPageBreak(80)
          pdf.addImage(mapUrl, 'PNG', margin, yPos, pageWidth - 2 * margin, 70)
          yPos += 75
        }
      } catch (error) {
        console.error('Error adding map to PDF:', error)
      }
      
      yPos += 10
    }
  }

  // === TERMS AND CONDITIONS ===
  if (sections.termsConditions) {
    addNewPage()
    
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Terms and Conditions', margin, yPos)
    
    yPos += 15
    pdf.setFontSize(10)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    
    const terms = [
      'This proposal is valid for 30 days from the date of issue.',
      'Pricing is subject to change based on fuel market conditions.',
      'Customer agrees to Circle K Pro standard terms of service.',
      'Implementation timeline is subject to site surveys and approval.',
      'All fees and charges are exclusive of applicable taxes.'
    ]
    
    terms.forEach(term => {
      checkPageBreak(8)
      pdf.text(`• ${term}`, margin, yPos)
      yPos += 7
    })
  }

  // === SIGNATURE PAGE ===
  if (sections.signaturePage) {
    addNewPage()
    
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Authorization', margin, yPos)
    
    yPos += 20
    pdf.setFontSize(11)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    
    const authText = `By signing below, the customer authorizes Circle K Pro to proceed with the implementation of the fleet fuel solution as outlined in this proposal.`
    const splitAuth = pdf.splitTextToSize(authText, pageWidth - 2 * margin)
    pdf.text(splitAuth, margin, yPos)
    
    yPos += 30
    
    // Signature lines
    pdf.setLineWidth(0.5)
    pdf.setDrawColor('#CCCCCC')
    pdf.line(margin, yPos, margin + 80, yPos)
    yPos += 6
    pdf.setFontSize(9)
    pdf.setTextColor('#666666')
    pdf.text('Authorized Signature', margin, yPos)
    
    yPos += 20
    pdf.line(margin, yPos, margin + 80, yPos)
    yPos += 6
    pdf.text('Date', margin, yPos)
  }

  // Save the PDF
  const filename = `CircleK_Pro_Proposal_${opportunityData.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}
