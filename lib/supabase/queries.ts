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

  if (!user) return []

  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching proposals:', error)
    return []
  }

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
    url: `/proposal/${newId}`
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
