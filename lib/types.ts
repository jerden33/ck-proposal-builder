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
    within2mi: number
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

// Database Types
export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  is_super_admin: boolean
  created_at: string
}

export interface ProposalRecord {
  id: string
  user_id: string
  customer_name: string
  status: 'draft' | 'shared' | 'archived'
  created_at: string
  updated_at: string
  last_viewed_at: string | null
  view_count: number
  data: {
    opportunityData: OpportunityData
    addresses: Address[]
    sections: ProposalSections
    products: Product[]
  }
  profiles?: {
    email: string
    full_name: string | null
  }
}

export interface ProductConfig {
  id: string
  name: string
  description: string
  default_features: string[]
  display_order: number
}

export interface AnalysisRecord {
  id: string
  user_id: string
  account_name: string
  file_name: string
  detected_format: string
  total_transactions: number
  total_gallons: number
  total_spend: number
  date_range_start: string | null
  date_range_end: string | null
  status: 'saved' | 'archived'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>   // TransactionSummary blob
  created_at: string
  updated_at: string
}

export interface AppSetting {
  id: string
  key: string
  value: string
  updated_at: string
}

export interface ProductImages {
  fleet: string | null
  universal: string | null
  digital: string | null
}

export interface ImageSettings {
  product_images: ProductImages
  hero_image: string | null
  feature_icons: Record<string, string>
}
