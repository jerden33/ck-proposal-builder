import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShareAnalysisView } from './ShareAnalysisView'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_analysis_share_data', {
    share_token: token,
  })

  if (error || !data) {
    notFound()
  }

  return (
    <ShareAnalysisView
      share={data.share}
      analysis={data.analysis}
      rep={data.rep}
    />
  )
}
