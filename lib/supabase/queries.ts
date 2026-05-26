import { createClient } from './client'
import type { UserProfile, ProductConfig, AppSetting, AnalysisRecord, AnalysisShare } from '@/lib/types'
import { isStaleMCS150Date, computeOpportunityScore, type FMCSACarrier } from '@/lib/fmcsa-parser'
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
  type: 'internal' | 'customer'
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

// ─── FMCSA Dataset (admin-managed, shared across all users) ──────────────────

export interface FMCSADatasetMeta {
  recordCount: number
  lastUpdated: string
  statesCovered: string[]
  uploadedBy: string
}

export interface FMCSAQueryFilters {
  states?: string[]
  citySearch?: string
  minPowerUnits?: number
  maxPowerUnits?: number
  carrierOperations?: string[]
  cargoTypes?: string[]
  hazmatOnly?: boolean
  passengerOnly?: boolean
  statusFilter?: 'active' | 'inactive' | 'all'
  includeStaleMCS150?: boolean
}

export interface FMCSAQueryResult {
  carriers: FMCSACarrier[]
  totalCount: number
}

// Upsert helper for app_settings (handles both insert and update)
async function upsertAppSetting(key: string, value: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) {
    console.error('Error upserting app setting:', error)
    return false
  }
  return true
}

export async function getFMCSADatasetMeta(): Promise<FMCSADatasetMeta | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'fmcsa_dataset_meta')
    .single()
  if (error || !data) return null
  try {
    return JSON.parse(data.value) as FMCSADatasetMeta
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCarrier(row: Record<string, any>): FMCSACarrier {
  return {
    dotNumber:        String(row.dot_number ?? ''),
    legalName:        String(row.legal_name ?? ''),
    dbaName:          String(row.dba_name ?? ''),
    address:          String(row.address ?? ''),
    city:             String(row.city ?? ''),
    state:            String(row.state ?? ''),
    zip:              String(row.zip ?? ''),
    phone:            String(row.phone ?? ''),
    powerUnits:       Number(row.power_units) || 0,
    drivers:          Number(row.drivers) || 0,
    carrierOperation: String(row.carrier_operation ?? ''),
    cargoCarried:     row.cargo_carried
      ? String(row.cargo_carried).split('|').map((s: string) => s.trim()).filter(Boolean)
      : [],
    operatingStatus:  String(row.operating_status ?? 'ACTIVE'),
    mcs150Date:       row.mcs150_date ? String(row.mcs150_date) : null,
    hmFlag:           Boolean(row.hm_flag),
    pcFlag:           Boolean(row.pc_flag),
    isStaleMCS150:    Boolean(row.is_stale_mcs150),
    opportunityScore: Number(row.opportunity_score) || 0,
  }
}

export async function queryFMCSACarriers(
  filters: FMCSAQueryFilters,
  sort: { column: string; ascending: boolean },
  page: number,
  pageSize: number
): Promise<FMCSAQueryResult> {
  const supabase = createClient()
  const from = page * pageSize
  const to   = from + pageSize - 1

  let q = supabase.from('fmcsa_carriers').select('*', { count: 'exact' })

  if (filters.states?.length)            q = q.in('state', filters.states)
  if (filters.citySearch?.trim())         q = q.ilike('city', `%${filters.citySearch.trim()}%`)
  if (filters.minPowerUnits)              q = q.gte('power_units', filters.minPowerUnits)
  if (filters.maxPowerUnits != null && filters.maxPowerUnits < 500)
                                          q = q.lte('power_units', filters.maxPowerUnits)
  if (filters.carrierOperations?.length)  q = q.in('carrier_operation', filters.carrierOperations)
  if (filters.hazmatOnly)                 q = q.eq('hm_flag', true)
  if (filters.passengerOnly)              q = q.eq('pc_flag', true)
  if (filters.statusFilter === 'active')   q = q.eq('operating_status', 'ACTIVE')
  if (filters.statusFilter === 'inactive') q = q.eq('operating_status', 'INACTIVE')
  if (!filters.includeStaleMCS150)        q = q.eq('is_stale_mcs150', false)
  if (filters.cargoTypes?.length) {
    const orClauses = filters.cargoTypes.map(t => `cargo_carried.ilike.%${t}%`).join(',')
    q = q.or(orClauses)
  }

  const { data, count, error } = await q
    .order(sort.column, { ascending: sort.ascending })
    .range(from, to)

  if (error) {
    console.error('Error querying FMCSA carriers:', error)
    return { carriers: [], totalCount: 0 }
  }

  return {
    carriers: (data ?? []).map(rowToCarrier),
    totalCount: count ?? 0,
  }
}

export async function exportAllFMCSACarriers(filters: FMCSAQueryFilters): Promise<FMCSACarrier[]> {
  const supabase = createClient()

  let q = supabase.from('fmcsa_carriers').select('*')

  if (filters.states?.length)            q = q.in('state', filters.states)
  if (filters.citySearch?.trim())         q = q.ilike('city', `%${filters.citySearch.trim()}%`)
  if (filters.minPowerUnits)              q = q.gte('power_units', filters.minPowerUnits)
  if (filters.maxPowerUnits != null && filters.maxPowerUnits < 500)
                                          q = q.lte('power_units', filters.maxPowerUnits)
  if (filters.carrierOperations?.length)  q = q.in('carrier_operation', filters.carrierOperations)
  if (filters.hazmatOnly)                 q = q.eq('hm_flag', true)
  if (filters.passengerOnly)              q = q.eq('pc_flag', true)
  if (filters.statusFilter === 'active')   q = q.eq('operating_status', 'ACTIVE')
  if (filters.statusFilter === 'inactive') q = q.eq('operating_status', 'INACTIVE')
  if (!filters.includeStaleMCS150)        q = q.eq('is_stale_mcs150', false)
  if (filters.cargoTypes?.length) {
    const orClauses = filters.cargoTypes.map(t => `cargo_carried.ilike.%${t}%`).join(',')
    q = q.or(orClauses)
  }

  const { data, error } = await q
    .order('opportunity_score', { ascending: false })
    .limit(50000)

  if (error) {
    console.error('Error exporting FMCSA carriers:', error)
    return []
  }
  return (data ?? []).map(rowToCarrier)
}

export async function uploadFMCSADataset(
  carriers: FMCSACarrier[],
  uploadedByEmail: string,
  onProgress?: (saved: number, total: number) => void
): Promise<boolean> {
  const profile = await getUserProfile()
  if (!profile?.is_admin) {
    console.error('Only admins can update the FMCSA dataset')
    return false
  }

  const supabase = createClient()

  const { error: truncErr } = await supabase.rpc('truncate_fmcsa_carriers')
  if (truncErr) {
    console.error('Error truncating FMCSA carriers:', truncErr)
    return false
  }

  const CHUNK = 1000
  for (let i = 0; i < carriers.length; i += CHUNK) {
    const rows = carriers.slice(i, i + CHUNK).map(c => ({
      dot_number:        c.dotNumber || null,
      legal_name:        c.legalName,
      dba_name:          c.dbaName || null,
      address:           c.address || null,
      city:              c.city || null,
      state:             c.state || null,
      zip:               c.zip || null,
      phone:             c.phone || null,
      power_units:       c.powerUnits,
      drivers:           c.drivers,
      carrier_operation: c.carrierOperation || null,
      cargo_carried:     c.cargoCarried.length ? c.cargoCarried.join('|') : null,
      operating_status:  c.operatingStatus,
      mcs150_date:       c.mcs150Date || null,
      hm_flag:           c.hmFlag,
      pc_flag:           c.pcFlag,
      is_stale_mcs150:   isStaleMCS150Date(c.mcs150Date),
      opportunity_score: computeOpportunityScore(c),
    }))

    const { error } = await supabase.from('fmcsa_carriers').insert(rows)
    if (error) {
      console.error(`Error inserting FMCSA chunk at offset ${i}:`, error)
      return false
    }
    onProgress?.(Math.min(i + CHUNK, carriers.length), carriers.length)
  }

  const meta: FMCSADatasetMeta = {
    recordCount: carriers.length,
    lastUpdated: new Date().toISOString(),
    statesCovered: Array.from(new Set(carriers.map(c => c.state).filter(Boolean))).sort(),
    uploadedBy: uploadedByEmail,
  }
  await upsertAppSetting('fmcsa_dataset_meta', JSON.stringify(meta))

  return true
}
