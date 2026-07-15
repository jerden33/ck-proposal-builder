// Database Types
export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  is_super_admin: boolean
  created_at: string
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
  profiles?: {
    email: string
    full_name: string | null
  }
}

export interface AnalysisShare {
  id: string
  analysis_id: string
  token: string
  type: 'internal' | 'customer' | 'map'
  created_by: string
  view_count: number
  created_at: string
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
