'use client'

import { Address } from '@/lib/types'
import { Plus, Trash2, MapPin } from 'lucide-react'

interface CoverageStepProps {
  addresses: Address[]
  addAddress: () => void
  removeAddress: (id: number) => void
  updateAddress: (id: number, value: string) => void
}

export function CoverageStep({ addresses, addAddress, removeAddress, updateAddress }: CoverageStepProps) {
  return (
    <div className="space-y-6 fade-in">
      <div className="card">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Coverage analysis</h2>
            <p className="text-gray-600">Add service addresses to analyze Circle K coverage</p>
          </div>
          <button onClick={addAddress} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            Add address
          </button>
        </div>
        
        {addresses.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-off-white mb-4">
              <MapPin size={36} className="text-brand-orange" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No addresses added yet</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Click "Add address" to analyze coverage for customer locations and show nearby Circle K stores
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((addr, index) => (
              <div key={addr.id} className="address-item">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-orange/10 flex items-center justify-center mt-1">
                    <span className="text-sm font-bold text-brand-orange">{index + 1}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <label className="input-label">
                      Service address {index + 1}
                    </label>
                    <input
                      type="text"
                      value={addr.address}
                      onChange={(e) => updateAddress(addr.id, e.target.value)}
                      placeholder="4521 Commerce St, Dallas, TX 75226"
                      className="input-field"
                    />
                    
                    {addr.geocoded && (
                      <div className="mt-5 pt-5 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 mb-5">
                          <div className="coverage-stat">
                            <p className="text-sm text-gray-600 mb-1">Within 5 miles</p>
                            <p className="coverage-number">{addr.coverage.within5mi}</p>
                            <p className="text-xs text-gray-500 mt-1">Circle K locations</p>
                          </div>
                          <div className="coverage-stat">
                            <p className="text-sm text-gray-600 mb-1">Within 10 miles</p>
                            <p className="coverage-number">{addr.coverage.within10mi}</p>
                            <p className="text-xs text-gray-500 mt-1">Circle K locations</p>
                          </div>
                        </div>
                        
                        <div className="w-full h-80 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
                          <div className="text-center">
                            <MapPin size={48} className="text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-500 font-medium">Map visualization</p>
                            <p className="text-sm text-gray-400">Mapbox integration coming soon</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => removeAddress(addr.id)}
                    className="flex-shrink-0 mt-8 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove address"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {addresses.length > 0 && (
        <div className="card bg-gradient-to-br from-orange-50 to-white border-brand-orange/30">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center">
              <span className="text-white text-lg">💡</span>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Coverage tip</h3>
              <p className="text-sm text-gray-700">
                Addresses will be geocoded and analyzed in the next step. Each location will show nearby Circle K stores and coverage statistics for your proposal.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
