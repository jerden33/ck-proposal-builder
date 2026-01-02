'use client'

import { OpportunityData, Address, products as productList } from '@/lib/types'
import { Building2, User, Package, TrendingUp, MapPin } from 'lucide-react'

interface PreviewPanelProps {
  opportunityData: OpportunityData
  addresses: Address[]
  products: typeof productList
}

export function PreviewPanel({ opportunityData, addresses, products }: PreviewPanelProps) {
  const selectedProducts = products.filter(p => 
    opportunityData.selectedProducts.includes(p.id)
  )

  return (
    <div className="preview-panel">
      <h3 className="text-xl font-bold mb-5 flex items-center gap-2">
        <div className="w-2 h-8 bg-gradient-to-b from-brand-orange to-dark-orange rounded-full"></div>
        Proposal preview
      </h3>
      
      <div className="space-y-5">
        <div className="pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3 mb-2">
            <Building2 size={18} className="text-brand-orange mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</p>
              {opportunityData.customerName ? (
                <p className="font-semibold text-off-black truncate">{opportunityData.customerName}</p>
              ) : (
                <p className="text-gray-400 italic text-sm">Not specified</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3 mb-2">
            <User size={18} className="text-brand-orange mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact</p>
              {opportunityData.contactName ? (
                <>
                  <p className="font-medium text-off-black">{opportunityData.contactName}</p>
                  {opportunityData.contactEmail && (
                    <p className="text-sm text-gray-600 truncate">{opportunityData.contactEmail}</p>
                  )}
                </>
              ) : (
                <p className="text-gray-400 italic text-sm">Not specified</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3 mb-2">
            <Package size={18} className="text-brand-orange mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Products</p>
              {selectedProducts.length > 0 ? (
                <div className="space-y-2">
                  {selectedProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-orange"></div>
                      <p className="text-sm font-medium text-off-black">{p.name}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 italic text-sm">None selected</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3 mb-2">
            <TrendingUp size={18} className="text-brand-orange mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Deal info</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Fleet size</p>
                  <p className="font-semibold text-off-black">
                    {opportunityData.fleetSize ? `${opportunityData.fleetSize} vehicles` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Value</p>
                  <p className="font-semibold text-off-black">{opportunityData.estimatedValue || '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-brand-orange mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Addresses</p>
              <p className="font-semibold text-off-black">
                {addresses.length} location{addresses.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Status Badge */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            opportunityData.customerName && opportunityData.selectedProducts.length > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {opportunityData.customerName && opportunityData.selectedProducts.length > 0
              ? 'Ready'
              : 'Incomplete'}
          </span>
        </div>
      </div>
    </div>
  )
}
