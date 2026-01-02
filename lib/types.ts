// Product definitions for Circle K Pro

export const products = [
  {
    id: 'fleet',
    name: 'Fleet Fuel Cards',
    description: 'Circle K network only with 6,000+ locations nationwide',
    features: ['10¢+ per gallon savings', 'No monthly fees', 'Real-time reporting', 'PIN security']
  },
  {
    id: 'universal',
    name: 'Universal Fleet Cards',
    description: 'Multi-brand acceptance via WEX network',
    features: ['Accepted at 90% of U.S. fuel sites', 'WEX network access', 'Broader coverage', 'Flexible controls']
  },
  {
    id: 'digital',
    name: 'Digital+',
    description: 'Mobile app and digital fleet management tools',
    features: ['Mobile app access', 'Digital receipts', 'Live GPS tracking', 'Advanced analytics']
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
  fleetSize: string
  estimatedValue: string
  closeDate: string
  notes: string
}

export interface Address {
  id: number
  address: string
  geocoded: boolean
  lat?: number
  lng?: number
  nearbyStores: any[]
  coverage: {
    within5mi: number
    within10mi: number
  }
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
}
