'use client'

import { Address } from '@/lib/types'
import { Plus, Trash2, MapPin, Search } from 'lucide-react'
import { MapComponent } from './MapComponent'
import dynamic from 'next/dynamic'

// Dynamically import map to avoid SSR issues
const DynamicMap = dynamic(() => import('./MapComponent').then(mod => mod.MapComponent), {
  ssr: false,
  loading: () => <div className="w-full h-80 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
    <p className="text-gray-500">Loading map...</p>
  </div>
})

interface CoverageStepProps {
  addresses: Address[]
  addAddress: () => void
  removeAddress: (id: number) => void
  updateAddress: (id: number, value: string) => void
  analyzeAddress: (id: number) => Promise<void>
}

export function CoverageStep({ addresses, addAddress, removeAddress, updateAddress, analyzeAddress }: CoverageStepProps) {
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
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={addr.address}
                        onChange={(e) => updateAddress(addr.id, e.target.value)}
                        placeholder="4521 Commerce St, Dallas, TX 75226"
                        className="input-field flex-1"
                      />
                      <button
                        onClick={() => analyzeAddress(addr.id)}
                        disabled={!addr.address || addr.analyzing}
                        className="btn-primary px-6 whitespace-nowrap flex items-center gap-2"
                      >
                        {addr.analyzing ? (
                          <>
                            <div className="loading-spinner w-4 h-4 border-2"></div>
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Search size={18} />
                            Analyze
                          </>
                        )}
                      </button>
                    </div>
                    
                    {addr.geocoded && addr.lat && addr.lng && (
                      <div className="mt-5 pt-5 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 mb-5">
                          <div className="coverage-stat">
                            <p className="text-sm text-gray-600 mb-1">Within 2 miles</p>
                            <p className="coverage-number">{addr.coverage.within2mi}</p>
                            <p className="text-xs text-gray-500 mt-1">Circle K locations</p>
                          </div>
                          <div className="coverage-stat">
                            <p className="text-sm text-gray-600 mb-1">Within 10 miles</p>
                            <p className="coverage-number">{addr.coverage.within10mi}</p>
                            <p className="text-xs text-gray-500 mt-1">Circle K locations</p>
                          </div>
                        </div>
                        
                        <DynamicMap
                          center={{ lat: addr.lat, lng: addr.lng }}
                          stores={addr.nearbyStores}
                          height={400}
                        />
                        
                        {addr.nearbyStores.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-semibold text-sm mb-3">Nearest locations (within 10 miles)</h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {addr.nearbyStores.slice(0, 20).map((store: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-off-white rounded-lg text-sm">
                                  <div className="w-6 h-6 rounded-full bg-brand-orange flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-white text-xs font-bold">{idx + 1}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold">{store.name}</p>
                                    <p className="text-gray-600 text-xs">{store.address}, {store.city}, {store.state}</p>
                                    {store.truckAccessible && (
                                      <span className="inline-block mt-1 text-xs text-brand-orange font-medium">✓ Truck Accessible</span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-500 flex-shrink-0">
                                    {store.distance?.toFixed(1)} mi
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
