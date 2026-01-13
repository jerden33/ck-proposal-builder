// PDF generation service for Circle K Pro proposals

import jsPDF from 'jspdf'
import { OpportunityData, Address, ProposalSections, Product } from './types'
import { getStaticMapUrl } from './mapbox'

const BRAND_ORANGE = '#ED8B00'
const DARK_ORANGE = '#D64303'
const OFF_BLACK = '#101820'
const OFF_WHITE = '#F7F5F2'
const LIGHT_GREY = '#F9F9F9'
const SUCCESS_GREEN = '#22c55e'
const DARK_GREEN = '#16a34a'

// NOTE: Circle K Pro logo file needed!
// Place 'circle-k-pro-logo.png' in /public folder
// Logo should include TM symbol and follow brand guidelines
const LOGO_PATH = '/circle-k-pro-logo.png' // Update when logo file is added

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
  let pageNumber = 1

  // Helper function to add new page
  const addNewPage = () => {
    pdf.addPage()
    pageNumber++
    yPos = margin
  }

  // Helper function to check if we need a new page
  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - margin) {
      addNewPage()
    }
  }

  // Helper function to draw rounded rectangle
  const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number, style: 'S' | 'F' | 'FD' = 'F') => {
    pdf.roundedRect(x, y, width, height, radius, radius, style)
  }

  // Helper function to draw gradient-like tile background
  const drawGradientTile = (x: number, y: number, width: number, height: number, radius: number = 3) => {
    // Base layer - light background
    pdf.setFillColor(OFF_WHITE)
    drawRoundedRect(x, y, width, height, radius, 'F')

    // Border
    pdf.setDrawColor(230, 230, 230)
    pdf.setLineWidth(0.3)
    drawRoundedRect(x, y, width, height, radius, 'S')
  }

  // Helper function to draw orange gradient tile (for highlights)
  const drawOrangeGradientTile = (x: number, y: number, width: number, height: number, radius: number = 3) => {
    // Base layer - light orange tint
    pdf.setFillColor(255, 248, 240)
    drawRoundedRect(x, y, width, height, radius, 'F')

    // Border with orange accent
    pdf.setDrawColor(237, 139, 0)
    pdf.setLineWidth(0.5)
    drawRoundedRect(x, y, width, height, radius, 'S')
  }

  // Helper function to draw icon-style circle with gradient
  const drawIconCircle = (x: number, y: number, radius: number) => {
    // Draw circle with brand orange
    pdf.setFillColor(237, 139, 0) // Brand orange
    pdf.circle(x, y, radius, 'F')
  }

  // Helper function to draw strong orange gradient card (for products)
  const drawOrangeGradientCard = (x: number, y: number, width: number, height: number, radius: number = 4) => {
    // Draw solid orange background
    pdf.setFillColor(214, 67, 3) // Dark orange
    drawRoundedRect(x, y, width, height, radius, 'F')
  }

  // Helper function to draw green gradient tile (for pricing highlights)
  const drawGreenGradientTile = (x: number, y: number, width: number, height: number, radius: number = 4) => {
    // Draw solid green background
    pdf.setFillColor(22, 163, 74) // Dark green
    drawRoundedRect(x, y, width, height, radius, 'F')
  }

  // Helper function to add footer with logo to pages
  const addFooter = (pageNumber?: number) => {
    const footerY = pageHeight - 12

    // Logo area (bottom right) - Using actual Circle K Pro logo
    try {
      // Logo dimensions: height of 8mm (proportional to 12px in UI)
      const logoHeight = 8
      const logoWidth = 40 // Approximate width for Circle K Pro logo
      const logoX = pageWidth - margin - logoWidth
      const logoY = footerY - logoHeight + 2

      // Add the logo image from public folder
      pdf.addImage(LOGO_PATH, 'PNG', logoX, logoY, logoWidth, logoHeight)
    } catch (error) {
      // Fallback to text if logo file is not available
      console.warn('Logo file not found, using text fallback')
      pdf.setFontSize(10)
      pdf.setTextColor(BRAND_ORANGE)
      pdf.setFont('helvetica', 'bold')

      const logoText = 'CIRCLE K'
      const logoWidth = pdf.getTextWidth(logoText)
      const logoX = pageWidth - margin - logoWidth - 15

      pdf.text(logoText, logoX, footerY)

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text('pro', logoX + logoWidth + 2, footerY)

      pdf.setFontSize(6)
      pdf.text('™', logoX + logoWidth + 11, footerY - 2)
    }

    // Confidential text (bottom left)
    pdf.setFontSize(9)
    pdf.setTextColor('#999999')
    pdf.setFont('helvetica', 'normal')
    pdf.text('Confidential Proposal', margin, footerY)

    // Page number (if provided)
    if (pageNumber) {
      pdf.setFontSize(9)
      pdf.text(`${pageNumber}`, pageWidth / 2, footerY, { align: 'center' })
    }
  }

  // === COVER PAGE ===
  // Background gradient effect for entire page
  pdf.setFillColor(OFF_WHITE)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  // Logo area (top right) - Using actual Circle K Pro logo
  try {
    const coverLogoHeight = 12
    const coverLogoWidth = 55
    const logoX = pageWidth - margin - coverLogoWidth
    const logoY = 20

    // Add the logo image from public folder
    pdf.addImage(LOGO_PATH, 'PNG', logoX, logoY, coverLogoWidth, coverLogoHeight)
  } catch (error) {
    // Fallback to text if logo file is not available
    console.warn('Logo file not found on cover page, using text fallback')
    const logoBarWidth = 55
    const logoBarHeight = 12
    const logoX = pageWidth - margin - logoBarWidth
    const logoY = 20

    drawOrangeGradientTile(logoX - 2, logoY - 2, logoBarWidth + 4, logoBarHeight + 4, 2)

    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('CIRCLE K', logoX + 2, logoY + 8)

    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(BRAND_ORANGE)
    pdf.text('pro', pageWidth - margin - 10, logoY + 11)
  }

  // Title section with background tile
  yPos = 70
  const titleBoxHeight = 60
  drawGradientTile(margin, yPos, pageWidth - 2 * margin, titleBoxHeight, 4)

  yPos += 15
  pdf.setFontSize(32)
  pdf.setTextColor(OFF_BLACK)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Fleet Fuel Solutions', margin + 8, yPos)

  yPos += 15
  pdf.setFontSize(24)
  pdf.text('Proposal', margin + 8, yPos)

  // Add accent bar below title
  yPos += 8
  pdf.setFillColor(237, 139, 0)
  pdf.rect(margin + 8, yPos, 60, 3, 'F')

  // Customer info tile
  yPos += 30
  const customerTileHeight = 35
  drawOrangeGradientTile(margin, yPos, pageWidth - 2 * margin, customerTileHeight, 4)

  yPos += 10
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(OFF_BLACK)
  pdf.text(`Prepared for`, margin + 8, yPos)

  yPos += 8
  pdf.setFontSize(18)
  pdf.setTextColor(DARK_ORANGE)
  pdf.text(opportunityData.customerName, margin + 8, yPos)

  yPos += 15
  pdf.setFontSize(12)
  pdf.setTextColor('#666666')
  pdf.setFont('helvetica', 'normal')
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  pdf.text(today, margin + 8, yPos)

  // Add footer to cover page
  addFooter()

  // === PAGE 2: EXECUTIVE SUMMARY ===
  if (sections.executiveSummary) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with gradient bar
    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Executive Summary', margin + 12, yPos + 5)

    yPos += 15

    // Summary text tile
    const summaryText = `Circle K Pro is pleased to present this comprehensive fleet fuel solutions proposal tailored to meet ${opportunityData.customerName}'s operational needs. Our program offers significant cost savings, nationwide coverage at over 6,000 locations, and streamlined fleet management tools.`
    const splitSummary = pdf.splitTextToSize(summaryText, pageWidth - 2 * margin - 16)

    const summaryTileHeight = splitSummary.length * 6 + 20
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, summaryTileHeight, 4)

    yPos += 10
    pdf.setFontSize(11)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    pdf.text(splitSummary, margin + 8, yPos)
    yPos += splitSummary.length * 6 + 10

    // Key Benefits section
    yPos += 10
    checkPageBreak(80)

    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(DARK_ORANGE)
    pdf.text('Key Benefits', margin, yPos)

    yPos += 10

    const benefits = [
      'Save at least 10¢ per gallon automatically',
      '6,000+ Circle K locations nationwide',
      'Real-time fleet spend analytics',
      'Easy fuel card management',
      'No monthly fees on Fleet Card option',
      'U.S.-based customer support'
    ]

    // Draw benefits in styled tiles
    const benefitTileWidth = (pageWidth - 2 * margin - 5) / 2
    const benefitTileHeight = 18
    let benefitX = margin
    let benefitY = yPos

    benefits.forEach((benefit, index) => {
      checkPageBreak(benefitTileHeight + 5)

      if (index % 2 === 0 && index > 0) {
        benefitY += benefitTileHeight + 5
        benefitX = margin
      } else if (index % 2 === 1) {
        benefitX = margin + benefitTileWidth + 5
      }

      // Draw gradient tile for each benefit
      drawOrangeGradientTile(benefitX, benefitY, benefitTileWidth, benefitTileHeight, 3)

      // Draw checkmark icon circle
      pdf.setFillColor(BRAND_ORANGE)
      pdf.circle(benefitX + 5, benefitY + 9, 2, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('✓', benefitX + 3.5, benefitY + 10.5)

      // Benefit text
      pdf.setFontSize(9)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')
      const splitBenefit = pdf.splitTextToSize(benefit, benefitTileWidth - 20)
      pdf.text(splitBenefit, benefitX + 10, benefitY + 10)
    })

    yPos = benefitY + benefitTileHeight + 10

    // Fleet Details
    if (opportunityData.fleetSize || opportunityData.monthlyGallons) {
      yPos += 10
      checkPageBreak(60)

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(DARK_ORANGE)
      pdf.text('Fleet Overview', margin, yPos)

      yPos += 10

      // Fleet size tile
      if (opportunityData.fleetSize) {
        const fleetTileHeight = 25
        drawGradientTile(margin, yPos, (pageWidth - 2 * margin - 5) / 2, fleetTileHeight, 3)

        pdf.setFontSize(10)
        pdf.setTextColor('#666666')
        pdf.setFont('helvetica', 'normal')
        pdf.text('Fleet Size', margin + 6, yPos + 8)

        pdf.setFontSize(18)
        pdf.setTextColor(DARK_ORANGE)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${opportunityData.fleetSize}`, margin + 6, yPos + 18)

        pdf.setFontSize(10)
        pdf.setTextColor(OFF_BLACK)
        pdf.setFont('helvetica', 'normal')
        pdf.text('vehicles', margin + 6 + pdf.getTextWidth(`${opportunityData.fleetSize}`) + 2, yPos + 18)
      }

      // Monthly gallons tile
      if (opportunityData.monthlyGallons) {
        const gallonTileHeight = 25
        const gallonTileX = margin + (pageWidth - 2 * margin - 5) / 2 + 5
        drawGradientTile(gallonTileX, yPos, (pageWidth - 2 * margin - 5) / 2, gallonTileHeight, 3)

        pdf.setFontSize(10)
        pdf.setTextColor('#666666')
        pdf.setFont('helvetica', 'normal')
        pdf.text('Monthly Fuel Usage', gallonTileX + 6, yPos + 8)

        pdf.setFontSize(18)
        pdf.setTextColor(DARK_ORANGE)
        pdf.setFont('helvetica', 'bold')
        const gallonsFormatted = Number(opportunityData.monthlyGallons).toLocaleString()
        pdf.text(gallonsFormatted, gallonTileX + 6, yPos + 18)

        pdf.setFontSize(10)
        pdf.setTextColor(OFF_BLACK)
        pdf.setFont('helvetica', 'normal')
        pdf.text('gallons', gallonTileX + 6 + pdf.getTextWidth(gallonsFormatted) + 2, yPos + 18)

        yPos += 30
      } else if (opportunityData.fleetSize) {
        yPos += 30
      }
    }

    // Add footer to Executive Summary page
    addFooter(pageNumber)
  }

  // === SELECTED PRODUCTS ===
  if (sections.solutionOverview) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Solution Overview', margin + 12, yPos + 5)

    yPos += 15

    const selectedProducts = products.filter(p =>
      opportunityData.selectedProducts.includes(p.id)
    )

    selectedProducts.forEach((product, index) => {
      if (index > 0) yPos += 10

      const descSplit = pdf.splitTextToSize(product.description, pageWidth - 2 * margin - 20)
      const featureCount = product.features.length
      const productTileHeight = 28 + descSplit.length * 6 + featureCount * 7

      checkPageBreak(productTileHeight + 10)

      // Draw product card with strong orange gradient
      drawOrangeGradientCard(margin, yPos, pageWidth - 2 * margin, productTileHeight, 5)

      // Product name (white on gradient)
      yPos += 12
      pdf.setFontSize(15)
      pdf.setTextColor(255, 255, 255) // White
      pdf.setFont('helvetica', 'bold')
      pdf.text(product.name, margin + 10, yPos)

      // Product description (white on gradient)
      yPos += 9
      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255) // White
      pdf.setFont('helvetica', 'normal')
      pdf.text(descSplit, margin + 10, yPos)
      yPos += descSplit.length * 6 + 6

      // Features with white checkmarks
      product.features.forEach(feature => {
        // White checkmark circle
        pdf.setFillColor(255, 255, 255)
        pdf.circle(margin + 12, yPos - 1.5, 1.2, 'F')

        pdf.setFontSize(9)
        pdf.setTextColor(255, 255, 255) // White text
        pdf.setFont('helvetica', 'normal')
        const featureSplit = pdf.splitTextToSize(feature, pageWidth - 2 * margin - 25)
        pdf.text(featureSplit, margin + 16, yPos)
        yPos += 7
      })

      yPos += 6
    })

    // Add footer to Solution Overview page
    addFooter(pageNumber)
  }

  // === PRICING SECTION ===
  const hasAnyPricingData = sections.showPerGallonDiscount || sections.showEstimatedSavings ||
                            sections.showAdditionalSavings || sections.showTotalAnnualValue

  if (hasAnyPricingData) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Pricing', margin + 12, yPos + 5)

    yPos += 20

    // Calculate savings if needed
    const perGallonDiscount = parseFloat(opportunityData.perGallonDiscount) || 0
    const monthlyGallons = parseFloat(opportunityData.monthlyGallons) || 0
    const monthlySavings = perGallonDiscount * monthlyGallons
    const annualFuelSavings = monthlySavings * 12

    // Per gallon discount
    if (sections.showPerGallonDiscount && perGallonDiscount > 0) {
      const discountTileHeight = 30
      drawOrangeGradientTile(margin, yPos, pageWidth - 2 * margin, discountTileHeight, 4)

      yPos += 10
      pdf.setFontSize(12)
      pdf.setTextColor('#666666')
      pdf.setFont('helvetica', 'normal')
      pdf.text('Per Gallon Discount', margin + 8, yPos)

      yPos += 10
      pdf.setFontSize(24)
      pdf.setTextColor(DARK_ORANGE)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${perGallonDiscount.toFixed(2)}¢`, margin + 8, yPos)

      pdf.setFontSize(12)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')
      pdf.text('per gallon', margin + 8 + pdf.getTextWidth(`${perGallonDiscount.toFixed(2)}¢`) + 3, yPos)

      yPos += 15
    }

    // Estimated fuel savings (Green Gradient)
    if (sections.showEstimatedSavings && monthlySavings > 0) {
      yPos += 5
      const savingsTileHeight = 50
      drawGreenGradientTile(margin, yPos, pageWidth - 2 * margin, savingsTileHeight, 5)

      yPos += 12
      pdf.setFontSize(11)
      pdf.setTextColor(255, 255, 255) // White
      pdf.setFont('helvetica', 'bold')
      pdf.text('Estimated Fuel Savings', margin + 10, yPos)

      yPos += 12

      // Monthly and Annual savings side-by-side
      const monthlyX = margin + 10
      const annualX = margin + (pageWidth - 2 * margin) / 2 + 5

      // Monthly
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Monthly', monthlyX, yPos)

      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, monthlyX, yPos + 10)

      // Annual
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Annual', annualX, yPos)

      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${annualFuelSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, annualX, yPos + 10)

      yPos += 26
    }

    // Additional cost savings
    if (sections.showAdditionalSavings && opportunityData.additionalSavings && opportunityData.additionalSavings.trim().length > 0) {
      yPos += 5

      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(DARK_ORANGE)
      pdf.text('Additional Cost Savings', margin, yPos)

      yPos += 10

      const additionalItems = opportunityData.additionalSavings.split('\n').filter(line => line.trim().length > 0)
      const itemsTileHeight = additionalItems.length * 10 + 15

      drawGradientTile(margin, yPos, pageWidth - 2 * margin, itemsTileHeight, 4)

      yPos += 10
      pdf.setFontSize(10)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')

      additionalItems.forEach(item => {
        pdf.setFillColor(BRAND_ORANGE)
        pdf.circle(margin + 9, yPos - 1.5, 0.8, 'F')

        const itemSplit = pdf.splitTextToSize(item.trim(), pageWidth - 2 * margin - 20)
        pdf.text(itemSplit, margin + 12, yPos)
        yPos += 10
      })

      yPos += 5
    }

    // Total annual value (Green Gradient - Eye-catching)
    if (sections.showTotalAnnualValue && annualFuelSavings > 0) {
      yPos += 10

      const totalTileHeight = 40
      drawGreenGradientTile(margin, yPos, pageWidth - 2 * margin, totalTileHeight, 5)

      yPos += 13
      pdf.setFontSize(12)
      pdf.setTextColor(255, 255, 255) // White
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOTAL ANNUAL VALUE', margin + 10, yPos)

      yPos += 14
      pdf.setFontSize(32)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${annualFuelSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, margin + 10, yPos)

      yPos += 18
    }

    // Add footer to Pricing page
    addFooter(pageNumber)
  }

  // === COVERAGE ANALYSIS ===
  if (sections.coverageAnalysis && addresses.length > 0) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Coverage Analysis', margin + 12, yPos + 5)

    yPos += 15

    for (const address of addresses) {
      if (!address.geocoded || !address.lat || !address.lng) continue

      checkPageBreak(140)

      // Address tile
      const addressTileHeight = 35
      drawGradientTile(margin, yPos, pageWidth - 2 * margin, addressTileHeight, 4)

      // Address header with icon
      pdf.setFillColor(BRAND_ORANGE)
      pdf.circle(margin + 6, yPos + 8, 2, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('📍', margin + 4.5, yPos + 9.5)

      pdf.setFontSize(12)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'bold')
      const addressText = pdf.splitTextToSize(address.formattedAddress || address.address, pageWidth - 2 * margin - 25)
      pdf.text(addressText, margin + 12, yPos + 9)

      // Coverage stats tiles
      yPos += 22
      const statTileWidth = (pageWidth - 2 * margin - 5) / 2
      const statTileHeight = 20

      // Within 5 miles stat
      drawOrangeGradientTile(margin + 8, yPos, statTileWidth - 8, statTileHeight, 3)

      pdf.setFontSize(9)
      pdf.setTextColor('#666666')
      pdf.setFont('helvetica', 'normal')
      pdf.text('Within 5 miles', margin + 12, yPos + 7)

      pdf.setFontSize(16)
      pdf.setTextColor(DARK_ORANGE)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${address.coverage.within5mi}`, margin + 12, yPos + 15)

      pdf.setFontSize(9)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')
      pdf.text('locations', margin + 12 + pdf.getTextWidth(`${address.coverage.within5mi}`) + 2, yPos + 15)

      // Within 10 miles stat
      const stat2X = margin + 8 + statTileWidth - 8 + 5
      drawOrangeGradientTile(stat2X, yPos, statTileWidth - 8, statTileHeight, 3)

      pdf.setFontSize(9)
      pdf.setTextColor('#666666')
      pdf.setFont('helvetica', 'normal')
      pdf.text('Within 10 miles', stat2X + 4, yPos + 7)

      pdf.setFontSize(16)
      pdf.setTextColor(DARK_ORANGE)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${address.coverage.within10mi}`, stat2X + 4, yPos + 15)

      pdf.setFontSize(9)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')
      pdf.text('locations', stat2X + 4 + pdf.getTextWidth(`${address.coverage.within10mi}`) + 2, yPos + 15)

      yPos += 30

      // Try to add static map image with rounded border
      try {
        const mapUrl = getStaticMapUrl(
          { lat: address.lat, lng: address.lng },
          address.nearbyStores.map(s => s.coordinates),
          600,
          400
        )

        if (mapUrl) {
          checkPageBreak(80)

          // Draw border for map
          pdf.setDrawColor(220, 220, 220)
          pdf.setLineWidth(1)
          drawRoundedRect(margin - 0.5, yPos - 0.5, pageWidth - 2 * margin + 1, 71, 4, 'S')

          // Add map image
          pdf.addImage(mapUrl, 'PNG', margin, yPos, pageWidth - 2 * margin, 70)
          yPos += 75
        }
      } catch (error) {
        console.error('Error adding map to PDF:', error)
      }

      yPos += 10
    }

    // Add footer to Coverage Analysis page
    addFooter(pageNumber)
  }

  // === TERMS AND CONDITIONS ===
  if (sections.termsConditions) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Terms and Conditions', margin + 12, yPos + 5)

    yPos += 15

    const terms = [
      'This proposal is valid for 30 days from the date of issue.',
      'Pricing is subject to change based on fuel market conditions.',
      'Customer agrees to Circle K Pro standard terms of service.',
      'Implementation timeline is subject to site surveys and approval.',
      'All fees and charges are exclusive of applicable taxes.'
    ]

    // Calculate total height needed for terms tile
    const termsTileHeight = terms.length * 10 + 15
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, termsTileHeight, 4)

    yPos += 10
    pdf.setFontSize(10)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')

    terms.forEach(term => {
      pdf.setFillColor(BRAND_ORANGE)
      pdf.circle(margin + 9, yPos - 1.5, 0.8, 'F')

      const termSplit = pdf.splitTextToSize(term, pageWidth - 2 * margin - 20)
      pdf.text(termSplit, margin + 12, yPos)
      yPos += 10
    })

    yPos += 5

    // Add footer to Terms page
    addFooter(pageNumber)
  }

  // === SIGNATURE PAGE ===
  if (sections.signaturePage) {
    addNewPage()

    // Add page background
    pdf.setFillColor(OFF_WHITE)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setFontSize(20)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 3, 3)
    pdf.text('Authorization', margin + 12, yPos + 5)

    yPos += 20

    // Authorization text tile
    const authText = `By signing below, the customer authorizes Circle K Pro to proceed with the implementation of the fleet fuel solution as outlined in this proposal.`
    const splitAuth = pdf.splitTextToSize(authText, pageWidth - 2 * margin - 16)

    const authTileHeight = splitAuth.length * 6 + 20
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, authTileHeight, 4)

    yPos += 12
    pdf.setFontSize(11)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    pdf.text(splitAuth, margin + 8, yPos)

    yPos += splitAuth.length * 6 + 20

    // Signature boxes with styling
    const sigBoxWidth = (pageWidth - 2 * margin - 10) / 2
    const sigBoxHeight = 35

    // Signature box
    drawOrangeGradientTile(margin, yPos, sigBoxWidth, sigBoxHeight, 4)

    pdf.setFontSize(9)
    pdf.setTextColor('#666666')
    pdf.setFont('helvetica', 'normal')
    pdf.text('Authorized Signature', margin + 6, yPos + 8)

    pdf.setLineWidth(0.5)
    pdf.setDrawColor(BRAND_ORANGE)
    pdf.line(margin + 6, yPos + 25, margin + sigBoxWidth - 6, yPos + 25)

    // Date box
    const dateBoxX = margin + sigBoxWidth + 10
    drawOrangeGradientTile(dateBoxX, yPos, sigBoxWidth, sigBoxHeight, 4)

    pdf.setFontSize(9)
    pdf.setTextColor('#666666')
    pdf.setFont('helvetica', 'normal')
    pdf.text('Date', dateBoxX + 6, yPos + 8)

    pdf.setLineWidth(0.5)
    pdf.setDrawColor(BRAND_ORANGE)
    pdf.line(dateBoxX + 6, yPos + 25, dateBoxX + sigBoxWidth - 6, yPos + 25)

    // Add footer to Signature page
    addFooter(pageNumber)
  }

  // Save the PDF
  const filename = `CircleK_Pro_Proposal_${opportunityData.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}
