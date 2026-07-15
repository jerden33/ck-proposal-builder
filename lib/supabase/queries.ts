import { createClient } from './client'
import type { UserProfile, ProductConfig, AppSetting, AnalysisRecord, AnalysisShare } from '@/lib/types'
import { nanoid } from 'nanoid'

// User Queries
export async function getCurrentUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }

  return data
}

// Product Config Queries
export async function getProductsConfig(): Promise<ProductConfig[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('products_config')
    .select('*')
    .order('display_order')

  if (error) {
    console.error('Error fetching products config:', error)
    return []
  }

  return data || []
}

export async function updateProductConfig(id: string, updates: Partial<ProductConfig>): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return false

  // Check if user is admin
  const profile = await getUserProfile()
  if (!profile?.is_admin) {
    console.error('User is not authorized to update product config')
    return false
  }

  const { error } = await supabase
    .from('products_config')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating product config:', error)
    return false
  }

  return true
}

// App Settings Queries
export async function getAppSettings(): Promise<AppSetting[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('app_settings')
    .select('*')

  if (error) {
    console.error('Error fetching app settings:', error)
    return []
  }

  return data || []
}

export async function getAppSetting(key: string): Promise<string | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error) {
    console.error('Error fetching app setting:', error)
    return null
  }

  return data?.value || null
}

export async function updateAppSetting(key: string, value: string): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return false

  // Check if user is admin
  const profile = await getUserProfile()
  if (!profile?.is_admin) {
    console.error('User is not authorized to update app settings')
    return false
  }

  const { error } = await supabase
    .from('app_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) {
    console.error('Error updating app setting:', error)
    return false
  }

  return true
}

// Image Settings Helpers
export async function getImageSettings(): Promise<import('@/lib/types').ImageSettings> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['product_images', 'hero_image', 'feature_icons'])

  if (error) {
    console.error('Error fetching image settings:', error)
    return {
      product_images: { fleet: null, universal: null, digital: null },
      hero_image: null,
      feature_icons: {}
    }
  }

  const settings: any = {}
  data?.forEach(item => {
    try {
      settings[item.key] = JSON.parse(item.value)
    } catch {
      settings[item.key] = item.value
    }
  })

  return {
    product_images: settings.product_images || { fleet: null, universal: null, digital: null },
    hero_image: settings.hero_image || null,
    feature_icons: settings.feature_icons || {}
  }
}

export async function updateProductImage(productId: string, imageUrl: string | null): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return false

  const profile = await getUserProfile()
  if (!profile?.is_admin) return false

  // Get current product_images setting
  const { data: currentSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'product_images')
    .single()

  let productImages: Record<string, string | null> = { fleet: null, universal: null, digital: null }
  if (currentSetting) {
    try {
      productImages = JSON.parse(currentSetting.value)
    } catch (e) {
      console.error('[updateProductImage] Failed to parse JSON:', e)
    }
  }

  productImages[productId] = imageUrl

  const { error } = await supabase
    .from('app_settings')
    .update({
      value: JSON.stringify(productImages),
      updated_at: new Date().toISOString()
    })
    .eq('key', 'product_images')

  if (error) {
    console.error('Error updating product image:', error)
    return false
  }

  return true
}

export async function updateHeroImage(imageUrl: string | null): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return false

  // Check if user is admin
  const profile = await getUserProfile()
  if (!profile?.is_admin) {
    console.error('User is not authorized to update hero image')
    return false
  }

  const { error } = await supabase
    .from('app_settings')
    .update({
      value: JSON.stringify(imageUrl),
      updated_at: new Date().toISOString()
    })
    .eq('key', 'hero_image')

  if (error) {
    console.error('Error updating hero image:', error)
    return false
  }

  return true
}

// ─── Analysis Queries ──────────────────────────────────────────────────────────

export async function createAnalysis(
  accountName: string,
  fileName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: Record<string, any>
): Promise<{ id: string } | null> {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const id = nanoid(10)

  const { error } = await supabase
    .from('analyses')
    .insert({
      id,
      user_id: user.id,
      account_name: accountName || '',
      file_name: fileName,
      detected_format: summary.detectedFormat ?? '',
      total_transactions: summary.totalTransactions ?? 0,
      total_gallons: summary.totalGallons ?? 0,
      total_spend: summary.totalSpend ?? 0,
      date_range_start: summary.dateRange?.start ?? null,
      date_range_end: summary.dateRange?.end ?? null,
      status: 'saved',
      data: summary,
    })

  if (error) {
    console.error('Error creating analysis:', error)
    return null
  }

  return { id }
}

export async function getUserAnalyses(): Promise<AnalysisRecord[]> {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return []

  const profile = await getUserProfile()

  let query = supabase
    .from('analyses')
    .select('id, user_id, account_name, file_name, detected_format, total_transactions, total_gallons, total_spend, date_range_start, date_range_end, status, data, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (!profile?.is_super_admin) {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching analyses:', error)
    return []
  }

  const analyses = (data || []) as AnalysisRecord[]

  // Attach profile data for super admins
  if (profile?.is_super_admin && analyses.length > 0) {
    const userIds = Array.from(new Set(analyses.map(a => a.user_id)))
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || [])
    return analyses.map(a => ({ ...a, profiles: profilesMap.get(a.user_id) || undefined }))
  }

  return analyses
}

export async function getAnalysis(id: string): Promise<AnalysisRecord | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching analysis:', error)
    return null
  }

  return data as AnalysisRecord
}

export async function updateAnalysisAccountName(id: string, accountName: string): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('analyses')
    .update({ account_name: accountName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error renaming analysis:', error)
    return false
  }
  return true
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('analyses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting analysis:', error)
    return false
  }

  return true
}

// ─── Analysis Share Queries ────────────────────────────────────────────────────

export async function getAnalysisShares(analysisId: string): Promise<AnalysisShare[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('analysis_shares')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching analysis shares:', error)
    return []
  }
  return data ?? []
}

export async function createAnalysisShare(
  analysisId: string,
  type: 'internal' | 'customer' | 'map'
): Promise<AnalysisShare | null> {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('analysis_shares')
    .insert({ analysis_id: analysisId, type, created_by: user.id })
    .select()
    .single()

  if (error) {
    console.error('Error creating analysis share:', error)
    return null
  }
  return data
}

export async function revokeAnalysisShare(token: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('analysis_shares')
    .delete()
    .eq('token', token)

  if (error) {
    console.error('Error revoking analysis share:', error)
    return false
  }
  return true
}
