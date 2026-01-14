// Product definitions for Circle K Pro

export const products = [
  {
    id: 'fleet',
    name: 'Circle K Pro Fleet Card',
    description: 'Circle K network only with 6,000+ locations nationwide',
    features: [
      'Real-time reporting and analytics',
      'PIN security and fraud protection',
      'Fuel-only restrictions available',
      'U.S.-based customer support',
      'Online account management',
      'Customizable spending controls',
      'No monthly fees',
      'Mobile app access'
    ]
  },
  {
    id: 'universal',
    name: 'Circle K Pro Universal Card (WEX Network)',
    description: 'Multi-brand acceptance via WEX network',
    features: [
      'Accepted at 90% of U.S. fuel sites',
      'WEX network access (95,000+ locations)',
      'Broader geographic coverage',
      'Flexible payment controls',
      'Enhanced reporting tools',
      'Multi-site acceptance',
      'Driver ID and odometer capture',
      'Fuel and maintenance purchases'
    ]
  },
  {
    id: 'digital',
    name: 'Digital+',
    description: 'Mobile app and digital fleet management tools',
    features: [
      'Mobile app for drivers and managers',
      'Digital receipts and expense tracking',
      'Live GPS fleet tracking',
      'Advanced analytics dashboard',
      'Route optimization insights',
      'Driver behavior monitoring',
      'Automated reporting',
      'Real-time alerts and notifications'
    ]
  }
]

export type Product = typeof products[0]

// Type definitions
export interface OpportunityData {
  customerName: string
  industry: string
  contactName: string
  contactEmail: string
  contactPhone: string
  selectedProducts: string[]
  customProductFeatures: { [productId: string]: string[] }
  fleetSize: string
  monthlyGallons: string
  closeDate: string
  notes: string
  perGallonDiscount: string
  additionalSavings: string
}

export interface Address {
  id: number
  address: string
  geocoded: boolean
  lat?: number
  lng?: number
  formattedAddress?: string
  nearbyStores: any[]
  coverage: {
    within5mi: number
    within10mi: number
  }
  analyzing?: boolean
}

export interface ProposalSections {
  executiveSummary: boolean
  aboutCircleK: boolean
  solutionOverview: boolean
  coverageAnalysis: boolean
  pricingTable: boolean
  implementationTimeline: boolean
  caseStudies: boolean
  termsConditions: boolean
  signaturePage: boolean
  showPerGallonDiscount: boolean
  showEstimatedSavings: boolean
  showAdditionalSavings: boolean
  showTotalAnnualValue: boolean
}
