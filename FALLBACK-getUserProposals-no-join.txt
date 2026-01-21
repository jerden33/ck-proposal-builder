// FALLBACK VERSION - Use this if the join version still doesn't work
// Replace the getUserProposals function in lib/supabase/queries.ts with this

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

  // Build query WITHOUT join - fetch proposals first
  const query = supabase
    .from('proposals')
    .select('*')
    .order('updated_at', { ascending: false })

  // Only super admins can see all proposals, everyone else sees only their own
  if (!profile?.is_super_admin) {
    console.log('[getUserProposals] User is NOT super admin, filtering to own proposals only')
    query.eq('user_id', user.id)
  } else {
    console.log('[getUserProposals] User IS super admin, fetching ALL proposals')
  }

  const { data: proposals, error } = await query

  if (error) {
    console.error('[getUserProposals] Error fetching proposals:', error)
    return []
  }

  console.log('[getUserProposals] Found', proposals?.length || 0, 'proposals')

  // If super admin, fetch profile data separately for each proposal
  if (profile?.is_super_admin && proposals && proposals.length > 0) {
    const userIds = [...new Set(proposals.map(p => p.user_id))]

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    // Map profiles to proposals
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || [])

    return proposals.map(proposal => ({
      ...proposal,
      profiles: profilesMap.get(proposal.user_id) || null
    }))
  }

  return proposals || []
}
