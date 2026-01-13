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

  // Helper function to draw drop shadow
  const drawShadow = (x: number, y: number, width: number, height: number, radius: number) => {
    pdf.setFillColor(0, 0, 0)
    pdf.setGState(pdf.GState({ opacity: 0.08 }))
    drawRoundedRect(x + 1, y + 1.5, width, height, radius, 'F')
    pdf.setGState(pdf.GState({ opacity: 1 }))
  }

  // Helper function to create linear gradient using layered rectangles
  const drawGradient = (x: number, y: number, width: number, height: number, radius: number, color1: [number, number, number], color2: [number, number, number], steps: number = 20) => {
    const stepHeight = height / steps

    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1)
      const r = Math.round(color1[0] + (color2[0] - color1[0]) * ratio)
      const g = Math.round(color1[1] + (color2[1] - color1[1]) * ratio)
      const b = Math.round(color1[2] + (color2[2] - color1[2]) * ratio)

      pdf.setFillColor(r, g, b)

      const currentY = y + i * stepHeight
      const currentHeight = stepHeight + 0.5 // Slight overlap to prevent gaps

      if (i === 0) {
        // First segment with top rounded corners
        pdf.rect(x, currentY, width, currentHeight, 'F')
      } else if (i === steps - 1) {
        // Last segment with bottom rounded corners
        pdf.rect(x, currentY, width, currentHeight, 'F')
      } else {
        // Middle segments without rounding
        pdf.rect(x, currentY, width, currentHeight, 'F')
      }
    }

    // Redraw outline with rounded corners
    pdf.setDrawColor(color2[0], color2[1], color2[2])
    pdf.setLineWidth(0.5)
    drawRoundedRect(x, y, width, height, radius, 'S')
  }

  // Helper function to draw subtle tile background
  const drawGradientTile = (x: number, y: number, width: number, height: number, radius: number = 4) => {
    // Draw shadow first
    drawShadow(x, y, width, height, radius)

    // Light gradient background
    pdf.setFillColor(255, 255, 255)
    drawRoundedRect(x, y, width, height, radius, 'F')

    // Subtle border
    pdf.setDrawColor(230, 230, 230)
    pdf.setLineWidth(0.5)
    drawRoundedRect(x, y, width, height, radius, 'S')
  }

  // Helper function to draw orange gradient tile (for highlights)
  const drawOrangeGradientTile = (x: number, y: number, width: number, height: number, radius: number = 4) => {
    // Draw shadow first
    drawShadow(x, y, width, height, radius)

    // Orange gradient: Brand Orange (#ED8B00) → Dark Orange (#D64303)
    drawGradient(x, y, width, height, radius, [237, 139, 0], [214, 67, 3], 25)
  }

  // Helper function to draw icon-style circle
  const drawIconCircle = (x: number, y: number, radius: number) => {
    // Draw shadow
    pdf.setFillColor(0, 0, 0)
    pdf.setGState(pdf.GState({ opacity: 0.1 }))
    pdf.circle(x + 0.3, y + 0.3, radius, 'F')
    pdf.setGState(pdf.GState({ opacity: 1 }))

    // Draw circle with brand orange
    pdf.setFillColor(237, 139, 0)
    pdf.circle(x, y, radius, 'F')
  }

  // Helper function to draw strong orange gradient card (for products)
  const drawOrangeGradientCard = (x: number, y: number, width: number, height: number, radius: number = 5) => {
    // Draw shadow first
    drawShadow(x, y, width, height, radius)

    // Strong orange gradient: Brand Orange → Dark Orange
    drawGradient(x, y, width, height, radius, [237, 139, 0], [214, 67, 3], 30)
  }

  // Helper function to draw green gradient tile (for pricing highlights)
  const drawGreenGradientTile = (x: number, y: number, width: number, height: number, radius: number = 5) => {
    // Draw shadow first for depth
    drawShadow(x, y, width, height, radius)

    // Vibrant green gradient: #10b981 → #059669
    drawGradient(x, y, width, height, radius, [16, 185, 129], [5, 150, 105], 30)
  }

  // Helper function to draw accent bar
  const drawAccentBar = (x: number, y: number, width: number, height: number) => {
    pdf.setFillColor(237, 139, 0) // Brand orange
    pdf.rect(x, y, width, height, 'F')
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
      pdf.setTextColor(DARK_ORANGE)
      pdf.setFont('helvetica', 'bold')

      const logoText = 'CIRCLE K'
      const logoWidth = pdf.getTextWidth(logoText)
      const logoX = pageWidth - margin - logoWidth - 15

      pdf.text(logoText, logoX, footerY)

      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(BRAND_ORANGE)
      pdf.text('pro', logoX + logoWidth + 2, footerY)

      pdf.setFontSize(6)
      pdf.setTextColor(DARK_ORANGE)
      pdf.setFont('helvetica', 'bold')
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
  // Modern gradient background
  pdf.setFillColor(249, 250, 251) // Very light gray
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
    const logoBarWidth = 58
    const logoBarHeight = 16
    const logoX = pageWidth - margin - logoBarWidth
    const logoY = 18

    // Background tile for logo
    drawGradientTile(logoX - 3, logoY - 3, logoBarWidth + 6, logoBarHeight + 6, 4)

    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('CIRCLE K', logoX + 2, logoY + 10)

    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(BRAND_ORANGE)
    pdf.text('pro', pageWidth - margin - 12, logoY + 13)

    // Add TM symbol
    pdf.setFontSize(8)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('™', pageWidth - margin - 5, logoY + 6)
  }

  // Title section with modern gradient tile
  yPos = 85
  const titleBoxHeight = 75
  drawOrangeGradientTile(margin, yPos, pageWidth - 2 * margin, titleBoxHeight, 10)

  yPos += 25
  pdf.setFontSize(36)
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Fleet Fuel Solutions', margin + 15, yPos)

  yPos += 20
  pdf.setFontSize(28)
  pdf.setGState(pdf.GState({ opacity: 0.95 }))
  pdf.text('Proposal', margin + 15, yPos)
  pdf.setGState(pdf.GState({ opacity: 1 }))

  // Add decorative accent bar
  yPos += 10
  pdf.setDrawColor(255, 255, 255)
  pdf.setLineWidth(2)
  pdf.setGState(pdf.GState({ opacity: 0.4 }))
  pdf.line(margin + 15, yPos, margin + 85, yPos)
  pdf.setGState(pdf.GState({ opacity: 1 }))

  // Customer info tile with gradient
  yPos += 30
  const customerTileHeight = 45
  drawGreenGradientTile(margin, yPos, pageWidth - 2 * margin, customerTileHeight, 10)

  yPos += 15
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.setGState(pdf.GState({ opacity: 0.9 }))
  pdf.text(`Prepared for`, margin + 15, yPos)
  pdf.setGState(pdf.GState({ opacity: 1 }))

  yPos += 12
  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.text(opportunityData.customerName, margin + 15, yPos)

  yPos += 12
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'normal')
  pdf.setGState(pdf.GState({ opacity: 0.9 }))
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  pdf.text(today, margin + 15, yPos)
  pdf.setGState(pdf.GState({ opacity: 1 }))

  // Add footer to cover page
  addFooter()

  // === PAGE 2: EXECUTIVE SUMMARY ===
  if (sections.executiveSummary) {
    addNewPage()

    // Add page background
    pdf.setFillColor(249, 250, 251) // Light gray background
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Executive Summary', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 18

    // Summary text tile with shadow
    const summaryText = `Circle K Pro is pleased to present this comprehensive fleet fuel solutions proposal tailored to meet ${opportunityData.customerName}'s operational needs. Our program offers significant cost savings, nationwide coverage at over 6,000 locations, and streamlined fleet management tools.`
    const splitSummary = pdf.splitTextToSize(summaryText, pageWidth - 2 * margin - 28)

    const summaryTileHeight = splitSummary.length * 7 + 24
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, summaryTileHeight, 6)

    yPos += 14
    pdf.setFontSize(12)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    pdf.text(splitSummary, margin + 14, yPos)
    yPos += splitSummary.length * 7 + 15

    // Key Benefits section
    yPos += 12
    checkPageBreak(80)

    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(DARK_ORANGE)
    pdf.text('Key Benefits', margin, yPos)

    yPos += 12

    const benefits = [
      'Save at least 10¢ per gallon automatically',
      '6,000+ Circle K locations nationwide',
      'Real-time fleet spend analytics',
      'Easy fuel card management',
      'No monthly fees on Fleet Card option',
      'U.S.-based customer support'
    ]

    // Draw benefits in styled gradient tiles
    const benefitTileWidth = (pageWidth - 2 * margin - 8) / 2
    const benefitTileHeight = 22
    let benefitX = margin
    let benefitY = yPos

    benefits.forEach((benefit, index) => {
      checkPageBreak(benefitTileHeight + 8)

      if (index % 2 === 0 && index > 0) {
        benefitY += benefitTileHeight + 8
        benefitX = margin
      } else if (index % 2 === 1) {
        benefitX = margin + benefitTileWidth + 8
      }

      // Draw orange gradient tile for each benefit
      drawOrangeGradientTile(benefitX, benefitY, benefitTileWidth, benefitTileHeight, 5)

      // Draw checkmark icon circle
      pdf.setFillColor(255, 255, 255)
      pdf.circle(benefitX + 8, benefitY + 11, 2.2, 'F')
      pdf.setTextColor(214, 67, 3) // Dark orange
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text('✓', benefitX + 6.3, benefitY + 12.5)

      // Benefit text
      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'normal')
      const splitBenefit = pdf.splitTextToSize(benefit, benefitTileWidth - 24)
      pdf.text(splitBenefit, benefitX + 13, benefitY + 12)
    })

    yPos = benefitY + benefitTileHeight + 12

    // Fleet Details
    if (opportunityData.fleetSize || opportunityData.monthlyGallons) {
      yPos += 12
      checkPageBreak(65)

      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(DARK_ORANGE)
      pdf.text('Fleet Overview', margin, yPos)

      yPos += 12

      const statBoxWidth = (pageWidth - 2 * margin - 10) / 2
      const statBoxHeight = 32

      // Fleet size tile
      if (opportunityData.fleetSize) {
        drawGreenGradientTile(margin, yPos, statBoxWidth, statBoxHeight, 6)

        pdf.setFontSize(10)
        pdf.setTextColor(255, 255, 255)
        pdf.setFont('helvetica', 'normal')
        pdf.setGState(pdf.GState({ opacity: 0.9 }))
        pdf.text('Fleet Size', margin + 10, yPos + 10)
        pdf.setGState(pdf.GState({ opacity: 1 }))

        pdf.setFontSize(22)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${opportunityData.fleetSize}`, margin + 10, yPos + 22)

        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        pdf.setGState(pdf.GState({ opacity: 0.9 }))
        pdf.text('vehicles', margin + 10 + pdf.getTextWidth(`${opportunityData.fleetSize}`) + 3, yPos + 22)
        pdf.setGState(pdf.GState({ opacity: 1 }))
      }

      // Monthly gallons tile
      if (opportunityData.monthlyGallons) {
        const gallonTileX = margin + statBoxWidth + 10
        drawGreenGradientTile(gallonTileX, yPos, statBoxWidth, statBoxHeight, 6)

        pdf.setFontSize(10)
        pdf.setTextColor(255, 255, 255)
        pdf.setFont('helvetica', 'normal')
        pdf.setGState(pdf.GState({ opacity: 0.9 }))
        pdf.text('Monthly Fuel Usage', gallonTileX + 10, yPos + 10)
        pdf.setGState(pdf.GState({ opacity: 1 }))

        pdf.setFontSize(22)
        pdf.setFont('helvetica', 'bold')
        const gallonsFormatted = Number(opportunityData.monthlyGallons).toLocaleString()
        pdf.text(gallonsFormatted, gallonTileX + 10, yPos + 22)

        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        pdf.setGState(pdf.GState({ opacity: 0.9 }))
        pdf.text('gallons', gallonTileX + 10 + pdf.getTextWidth(gallonsFormatted) + 3, yPos + 22)
        pdf.setGState(pdf.GState({ opacity: 1 }))

        yPos += statBoxHeight + 15
      } else if (opportunityData.fleetSize) {
        yPos += statBoxHeight + 15
      }
    }

    // Add footer to Executive Summary page
    addFooter(pageNumber)
  }

  // === SELECTED PRODUCTS ===
  if (sections.solutionOverview) {
    addNewPage()

    // Add page background
    pdf.setFillColor(249, 250, 251) // Light gray background
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Solution Overview', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 20

    const selectedProducts = products.filter(p =>
      opportunityData.selectedProducts.includes(p.id)
    )

    selectedProducts.forEach((product, index) => {
      if (index > 0) yPos += 12

      const descSplit = pdf.splitTextToSize(product.description, pageWidth - 2 * margin - 28)
      const featureCount = product.features.length
      const productTileHeight = 36 + descSplit.length * 6 + featureCount * 8

      checkPageBreak(productTileHeight + 12)

      // Draw product card with vibrant orange gradient and shadow
      drawOrangeGradientCard(margin, yPos, pageWidth - 2 * margin, productTileHeight, 8)

      // Product name (white on gradient) - Larger and bolder
      yPos += 16
      pdf.setFontSize(18)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text(product.name, margin + 14, yPos)

      // Product description (white on gradient) - Slightly transparent
      yPos += 10
      pdf.setFontSize(11)
      pdf.setGState(pdf.GState({ opacity: 0.95 }))
      pdf.setFont('helvetica', 'normal')
      pdf.text(descSplit, margin + 14, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))
      yPos += descSplit.length * 6 + 8

      // Divider line
      pdf.setDrawColor(255, 255, 255)
      pdf.setLineWidth(0.3)
      pdf.setGState(pdf.GState({ opacity: 0.3 }))
      pdf.line(margin + 14, yPos, pageWidth - margin - 14, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      yPos += 6

      // Features with styled checkmarks
      product.features.forEach(feature => {
        // White checkmark circle with slight shadow
        pdf.setFillColor(255, 255, 255)
        pdf.setGState(pdf.GState({ opacity: 0.3 }))
        pdf.circle(margin + 17, yPos - 1, 1.8, 'F')
        pdf.setGState(pdf.GState({ opacity: 1 }))

        pdf.setFillColor(255, 255, 255)
        pdf.circle(margin + 16.5, yPos - 1.5, 1.8, 'F')

        // Checkmark text
        pdf.setFontSize(10)
        pdf.setTextColor(214, 67, 3) // Dark orange for contrast
        pdf.setFont('helvetica', 'bold')
        pdf.text('✓', margin + 15, yPos - 0.2)

        // Feature text
        pdf.setFontSize(10)
        pdf.setTextColor(255, 255, 255)
        pdf.setFont('helvetica', 'normal')
        const featureSplit = pdf.splitTextToSize(feature, pageWidth - 2 * margin - 32)
        pdf.text(featureSplit, margin + 22, yPos)
        yPos += 8
      })

      yPos += 8
    })

    // Add footer to Solution Overview page
    addFooter(pageNumber)
  }

  // === PRICING SECTION ===
  const hasAnyPricingData = sections.showPerGallonDiscount || sections.showEstimatedSavings ||
                            sections.showAdditionalSavings || sections.showTotalAnnualValue

  if (hasAnyPricingData) {
    addNewPage()

    // Add page background with subtle gradient
    pdf.setFillColor(249, 250, 251) // Very light gray
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Pricing Breakdown', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 15

    // Calculate savings if needed
    const perGallonDiscount = parseFloat(opportunityData.perGallonDiscount) || 0
    const monthlyGallons = parseFloat(opportunityData.monthlyGallons) || 0
    const monthlySavings = perGallonDiscount * monthlyGallons
    const annualFuelSavings = monthlySavings * 12

    // Parse additional savings to calculate total
    let additionalAnnualSavings = 0
    if (sections.showAdditionalSavings && opportunityData.additionalSavings) {
      const additionalItems = opportunityData.additionalSavings.split('\n').filter(line => line.trim().length > 0)
      additionalItems.forEach(item => {
        // Extract monetary values like $500/mo or $500/month
        const monthlyMatch = item.match(/\$([0-9,]+)\s*\/\s*mo(?:nth)?/i)
        if (monthlyMatch) {
          const value = parseFloat(monthlyMatch[1].replace(/,/g, ''))
          additionalAnnualSavings += value * 12
        }
        // Extract annual values like $6000/year
        const annualMatch = item.match(/\$([0-9,]+)\s*\/\s*(?:year|yr|annually)/i)
        if (annualMatch) {
          additionalAnnualSavings += parseFloat(annualMatch[1].replace(/,/g, ''))
        }
      })
    }

    const totalAnnualValue = annualFuelSavings + additionalAnnualSavings

    // === MAIN PRICING BOX - Eye-catching Green Gradient ===
    if (sections.showEstimatedSavings && monthlySavings > 0) {
      const pricingBoxHeight = 75
      drawGreenGradientTile(margin, yPos, pageWidth - 2 * margin, pricingBoxHeight, 8)

      // Icon/emoji
      pdf.setFontSize(28)
      pdf.text('💰', margin + 12, yPos + 15)

      // Title
      yPos += 13
      pdf.setFontSize(14)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ESTIMATED FUEL SAVINGS', margin + 30, yPos)

      yPos += 8

      // Divider line
      pdf.setDrawColor(255, 255, 255)
      pdf.setLineWidth(0.3)
      pdf.setGState(pdf.GState({ opacity: 0.3 }))
      pdf.line(margin + 30, yPos, pageWidth - margin - 12, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      yPos += 12

      // Details layout
      const contentWidth = pageWidth - 2 * margin - 30
      const col1Width = contentWidth / 3
      const col2Width = contentWidth / 3
      const col3Width = contentWidth / 3

      // Per Gallon Discount
      const col1X = margin + 30
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('Per Gallon', col1X, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${perGallonDiscount.toFixed(2)}¢`, col1X, yPos + 10)

      // Monthly Gallons
      const col2X = col1X + col1Width
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('Monthly Gallons', col2X, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      const gallonsFormatted = Number(monthlyGallons).toLocaleString()
      pdf.text(gallonsFormatted, col2X, yPos + 10)

      // Monthly Savings
      const col3X = col2X + col2Width
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('Monthly Savings', col3X, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, col3X, yPos + 10)

      yPos += 20

      // Annual Savings - Prominent
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('ANNUAL FUEL SAVINGS', col1X, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(32)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${annualFuelSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, col1X, yPos + 12)

      yPos += 28
    }

    // Per gallon discount (if shown without savings calculation)
    if (sections.showPerGallonDiscount && perGallonDiscount > 0 && (!sections.showEstimatedSavings || monthlySavings === 0)) {
      yPos += 5
      const discountTileHeight = 35
      drawOrangeGradientTile(margin, yPos, pageWidth - 2 * margin, discountTileHeight, 6)

      yPos += 13
      pdf.setFontSize(11)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Per Gallon Discount', margin + 15, yPos)

      yPos += 12
      pdf.setFontSize(28)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${perGallonDiscount.toFixed(2)}¢`, margin + 15, yPos)

      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('per gallon', margin + 15 + pdf.getTextWidth(`${perGallonDiscount.toFixed(2)}¢`) + 3, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      yPos += 18
    }

    // Additional cost savings
    if (sections.showAdditionalSavings && opportunityData.additionalSavings && opportunityData.additionalSavings.trim().length > 0) {
      yPos += 12

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(DARK_ORANGE)
      pdf.text('Additional Cost Savings', margin, yPos)

      yPos += 10

      const additionalItems = opportunityData.additionalSavings.split('\n').filter(line => line.trim().length > 0)
      const itemsTileHeight = additionalItems.length * 12 + 20

      drawGradientTile(margin, yPos, pageWidth - 2 * margin, itemsTileHeight, 5)

      yPos += 14
      pdf.setFontSize(10)
      pdf.setTextColor(OFF_BLACK)
      pdf.setFont('helvetica', 'normal')

      additionalItems.forEach(item => {
        // Checkmark circle
        pdf.setFillColor(16, 185, 129) // Green
        pdf.circle(margin + 12, yPos - 2, 1.5, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.text('✓', margin + 10.5, yPos - 0.5)

        pdf.setFontSize(11)
        pdf.setTextColor(OFF_BLACK)
        pdf.setFont('helvetica', 'normal')
        const itemSplit = pdf.splitTextToSize(item.trim(), pageWidth - 2 * margin - 30)
        pdf.text(itemSplit, margin + 18, yPos)
        yPos += 12
      })

      yPos += 8
    }

    // Total annual value (Green Gradient - HUGE and eye-catching)
    if (sections.showTotalAnnualValue && totalAnnualValue > 0) {
      yPos += 10

      const totalTileHeight = 55
      drawGreenGradientTile(margin, yPos, pageWidth - 2 * margin, totalTileHeight, 8)

      yPos += 17
      pdf.setFontSize(14)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOTAL ANNUAL VALUE', margin + 15, yPos)

      yPos += 8
      // Decorative line
      pdf.setDrawColor(255, 255, 255)
      pdf.setLineWidth(0.5)
      pdf.setGState(pdf.GState({ opacity: 0.4 }))
      pdf.line(margin + 15, yPos, pageWidth - margin - 15, yPos)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      yPos += 16
      pdf.setFontSize(36)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`$${totalAnnualValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, margin + 15, yPos)

      yPos += 20
    }

    // Add footer to Pricing page
    addFooter(pageNumber)
  }

  // === COVERAGE ANALYSIS ===
  if (sections.coverageAnalysis && addresses.length > 0) {
    addNewPage()

    // Add page background
    pdf.setFillColor(249, 250, 251) // Light gray background
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Coverage Analysis', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 20

    for (const address of addresses) {
      if (!address.geocoded || !address.lat || !address.lng) continue

      checkPageBreak(150)

      // Address header box with gradient
      const addressTileHeight = 28
      drawOrangeGradientTile(margin, yPos, pageWidth - 2 * margin, addressTileHeight, 6)

      // Address header with icon
      pdf.setFontSize(16)
      pdf.text('📍', margin + 12, yPos + 13)

      pdf.setFontSize(13)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      const addressText = pdf.splitTextToSize(address.formattedAddress || address.address, pageWidth - 2 * margin - 35)
      pdf.text(addressText, margin + 20, yPos + 13)

      yPos += addressTileHeight + 8

      // Coverage stats boxes - Orange gradient with white text
      const statBoxWidth = (pageWidth - 2 * margin - 10) / 2
      const statBoxHeight = 32

      // Within 5 miles stat
      drawOrangeGradientTile(margin, yPos, statBoxWidth, statBoxHeight, 6)

      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('Within 5 miles', margin + 10, yPos + 10)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(22)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${address.coverage.within5mi}`, margin + 10, yPos + 22)

      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('locations', margin + 10 + pdf.getTextWidth(`${address.coverage.within5mi}`) + 3, yPos + 22)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      // Within 10 miles stat
      const stat2X = margin + statBoxWidth + 10
      drawOrangeGradientTile(stat2X, yPos, statBoxWidth, statBoxHeight, 6)

      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('Within 10 miles', stat2X + 10, yPos + 10)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      pdf.setFontSize(22)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${address.coverage.within10mi}`, stat2X + 10, yPos + 22)

      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      pdf.setGState(pdf.GState({ opacity: 0.9 }))
      pdf.text('locations', stat2X + 10 + pdf.getTextWidth(`${address.coverage.within10mi}`) + 3, yPos + 22)
      pdf.setGState(pdf.GState({ opacity: 1 }))

      yPos += statBoxHeight + 10

      // Try to add static map image with enhanced border and shadow
      try {
        const mapUrl = getStaticMapUrl(
          { lat: address.lat, lng: address.lng },
          address.nearbyStores.map(s => s.coordinates),
          600,
          400
        )

        if (mapUrl) {
          checkPageBreak(82)

          // Draw shadow for map
          drawShadow(margin, yPos, pageWidth - 2 * margin, 70, 5)

          // Draw border for map
          pdf.setDrawColor(214, 67, 3) // Dark orange border
          pdf.setLineWidth(1.5)
          drawRoundedRect(margin - 0.5, yPos - 0.5, pageWidth - 2 * margin + 1, 71, 5, 'S')

          // Add map image
          pdf.addImage(mapUrl, 'PNG', margin, yPos, pageWidth - 2 * margin, 70)
          yPos += 78
        }
      } catch (error) {
        console.error('Error adding map to PDF:', error)
      }

      yPos += 15
    }

    // Add footer to Coverage Analysis page
    addFooter(pageNumber)
  }

  // === TERMS AND CONDITIONS ===
  if (sections.termsConditions) {
    addNewPage()

    // Add page background
    pdf.setFillColor(249, 250, 251) // Light gray background
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Terms and Conditions', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 20

    const terms = [
      'This proposal is valid for 30 days from the date of issue.',
      'Pricing is subject to change based on fuel market conditions.',
      'Customer agrees to Circle K Pro standard terms of service.',
      'Implementation timeline is subject to site surveys and approval.',
      'All fees and charges are exclusive of applicable taxes.'
    ]

    // Calculate total height needed for terms tile
    const termsTileHeight = terms.length * 12 + 22
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, termsTileHeight, 6)

    yPos += 14
    pdf.setFontSize(11)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')

    terms.forEach(term => {
      // Orange bullet circle
      pdf.setFillColor(BRAND_ORANGE)
      pdf.circle(margin + 12, yPos - 2, 1.2, 'F')

      const termSplit = pdf.splitTextToSize(term, pageWidth - 2 * margin - 30)
      pdf.text(termSplit, margin + 18, yPos)
      yPos += 12
    })

    yPos += 10

    // Add footer to Terms page
    addFooter(pageNumber)
  }

  // === SIGNATURE PAGE ===
  if (sections.signaturePage) {
    addNewPage()

    // Add page background
    pdf.setFillColor(249, 250, 251) // Light gray background
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Section header with accent bar
    pdf.setFontSize(24)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    drawIconCircle(margin + 4, yPos + 4, 3.5)
    pdf.text('Authorization', margin + 14, yPos + 7)

    // Accent bar under header
    yPos += 10
    drawAccentBar(margin + 14, yPos, 45, 1.5)

    yPos += 22

    // Authorization text tile with shadow
    const authText = `By signing below, the customer authorizes Circle K Pro to proceed with the implementation of the fleet fuel solution as outlined in this proposal.`
    const splitAuth = pdf.splitTextToSize(authText, pageWidth - 2 * margin - 28)

    const authTileHeight = splitAuth.length * 7 + 24
    drawGradientTile(margin, yPos, pageWidth - 2 * margin, authTileHeight, 6)

    yPos += 14
    pdf.setFontSize(12)
    pdf.setTextColor(OFF_BLACK)
    pdf.setFont('helvetica', 'normal')
    pdf.text(splitAuth, margin + 14, yPos)

    yPos += splitAuth.length * 7 + 25

    // Signature boxes with gradient styling
    const sigBoxWidth = (pageWidth - 2 * margin - 12) / 2
    const sigBoxHeight = 42

    // Signature box with white background
    drawGradientTile(margin, yPos, sigBoxWidth, sigBoxHeight, 6)

    pdf.setFontSize(11)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Authorized Signature', margin + 12, yPos + 12)

    pdf.setLineWidth(1)
    pdf.setDrawColor(BRAND_ORANGE)
    pdf.line(margin + 12, yPos + 30, margin + sigBoxWidth - 12, yPos + 30)

    // Date box with white background
    const dateBoxX = margin + sigBoxWidth + 12
    drawGradientTile(dateBoxX, yPos, sigBoxWidth, sigBoxHeight, 6)

    pdf.setFontSize(11)
    pdf.setTextColor(DARK_ORANGE)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Date', dateBoxX + 12, yPos + 12)

    pdf.setLineWidth(1)
    pdf.setDrawColor(BRAND_ORANGE)
    pdf.line(dateBoxX + 12, yPos + 30, dateBoxX + sigBoxWidth - 12, yPos + 30)

    // Add footer to Signature page
    addFooter(pageNumber)
  }

  // Save the PDF
  const filename = `CircleK_Pro_Proposal_${opportunityData.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}
