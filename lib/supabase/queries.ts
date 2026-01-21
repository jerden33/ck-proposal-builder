import { createClient } from './client'
import type { UserProfile, ProposalRecord, ProductConfig, AppSetting } from '@/lib/types'
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

// Proposal Queries
export async function getUserProposals(): Promise<ProposalRecord[]> {
  const supabase = createClient()
  const user = await getCurrentUser()

  console.log('[getUserProposals] Current user:', user?.id, user?.email)

  if (!user) {
    console.log('[getUserProposals] No user found, returning empty array')
    return []
  }

  // Check if user is super admin (only super admins can see all proposals)
  const profile = await getUserProfile()
  console.log('[getUserProposals] User profile:', {
    id: profile?.id,
    email: profile?.email,
    is_admin: profile?.is_admin,
    is_super_admin: profile?.is_super_admin
  })

  // Build query - try simpler approach without specifying FK name
  const query = supabase
    .from('proposals')
    .select(`
      *,
      profiles (
        email,
        full_name
      )
    `)
    .order('updated_at', { ascending: false })

  // Only super admins can see all proposals, everyone else sees only their own
  if (!profile?.is_super_admin) {
    console.log('[getUserProposals] User is NOT super admin, filtering to own proposals only')
    query.eq('user_id', user.id)
  } else {
    console.log('[getUserProposals] User IS super admin, fetching ALL proposals')
  }

  const { data, error } = await query

  if (error) {
    console.error('[getUserProposals] Error fetching proposals:', error)
    return []
  }

  console.log('[getUserProposals] Found', data?.length || 0, 'proposals')

  return data || []
}

export async function getProposal(id: string): Promise<ProposalRecord | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching proposal:', error)
    return null
  }

  return data
}

export async function createProposal(proposalData: ProposalRecord['data']): Promise<{ id: string; url: string } | null> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const id = nanoid(10) // Generate short, URL-friendly ID
  const customerName = proposalData.opportunityData.customerName || 'Untitled Proposal'

  const { error } = await supabase
    .from('proposals')
    .insert({
      id,
      user_id: user.id,
      customer_name: customerName,
      status: 'draft',
      data: proposalData
    })

  if (error) {
    console.error('Error creating proposal:', error)
    return null
  }

  return {
    id,
    url: `/proposal?id=${id}`
  }
}

export async function updateProposal(id: string, proposalData: Partial<ProposalRecord>): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return false

  const { error } = await supabase
    .from('proposals')
    .update({
      ...proposalData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error updating proposal:', error)
    return false
  }

  return true
}

export async function archiveProposal(id: string): Promise<boolean> {
  return updateProposal(id, { status: 'archived' })
}

export async function deleteProposal(id: string): Promise<boolean> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) {
    console.error('User not authenticated')
    return false
  }

  // Check if user is admin
  const profile = await getUserProfile()
  if (!profile?.is_admin) {
    console.error('User is not authorized to delete proposals')
    return false
  }

  const { error } = await supabase
    .from('proposals')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting proposal:', error)
    return false
  }

  return true
}

export async function duplicateProposal(id: string): Promise<{ id: string; url: string } | null> {
  const supabase = createClient()
  const user = await getCurrentUser()

  if (!user) return null

  // Get the original proposal
  const original = await getProposal(id)
  if (!original) return null

  // Create new proposal with copied data
  const newId = nanoid(10)
  const { error } = await supabase
    .from('proposals')
    .insert({
      id: newId,
      user_id: user.id,
      customer_name: `${original.customer_name} (Copy)`,
      status: 'draft',
      data: original.data
    })

  if (error) {
    console.error('Error duplicating proposal:', error)
    return null
  }

  return {
    id: newId,
    url: `/proposal?id=${newId}`
  }
}

export async function incrementProposalViews(id: string): Promise<void> {
  const supabase = createClient()

  await supabase.rpc('increment_proposal_views', { proposal_id: id })
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
  console.log('[updateProductImage] START - productId:', productId, 'imageUrl:', imageUrl)

  const supabase = createClient()
  const user = await getCurrentUser()

  console.log('[updateProductImage] Current user:', user?.id)

  if (!user) {
    console.error('[updateProductImage] FAIL - No user found')
    return false
  }

  // Check if user is admin
  const profile = await getUserProfile()
  console.log('[updateProductImage] User profile:', { id: profile?.id, email: profile?.email, is_admin: profile?.is_admin })

  if (!profile?.is_admin) {
    console.error('[updateProductImage] FAIL - User is not admin')
    return false
  }

  console.log('[updateProductImage] Fetching current product_images from database...')

  // Get current product_images setting
  const { data: currentSetting, error: fetchError } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'product_images')
    .single()

  console.log('[updateProductImage] Current setting:', currentSetting, 'Fetch error:', fetchError)

  let productImages: any = { fleet: null, universal: null, digital: null }
  if (currentSetting) {
    try {
      productImages = JSON.parse(currentSetting.value)
      console.log('[updateProductImage] Parsed existing images:', productImages)
    } catch (e) {
      console.error('[updateProductImage] Failed to parse JSON:', e)
    }
  }

  // Update the specific product
  productImages[productId] = imageUrl
  console.log('[updateProductImage] Updated images object:', productImages)

  const stringified = JSON.stringify(productImages)
  console.log('[updateProductImage] Stringified for database:', stringified)

  const { error } = await supabase
    .from('app_settings')
    .update({
      value: stringified,
      updated_at: new Date().toISOString()
    })
    .eq('key', 'product_images')

  if (error) {
    console.error('[updateProductImage] FAIL - Database update error:', error)
    return false
  }

  console.log('[updateProductImage] SUCCESS - Image URL saved to database!')
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
