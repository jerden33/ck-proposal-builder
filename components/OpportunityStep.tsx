'use client'

import { OpportunityData, products as productList } from '@/lib/types'
import { Check } from 'lucide-react'

interface OpportunityStepProps {
  data: OpportunityData
  products: typeof productList
  updateOpportunity: (field: keyof OpportunityData, value: string | string[]) => void
  toggleProduct: (productId: string) => void
}

export function OpportunityStep({ data, products, updateOpportunity, toggleProduct }: OpportunityStepProps) {
  return (
    <div className="space-y-6 stagger-children">
      {/* Customer Information */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">Customer information</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="input-label">Company name</label>
            <input
              type="text"
              value={data.customerName}
              onChange={(e) => updateOpportunity('customerName', e.target.value)}
              placeholder="Acme Corporation"
              className="input-field"
            />
          </div>
          
          <div>
            <label className="input-label">Industry</label>
            <input
              type="text"
              value={data.industry}
              onChange={(e) => updateOpportunity('industry', e.target.value)}
              placeholder="Manufacturing"
              className="input-field"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          <div>
            <label className="input-label">Primary contact</label>
            <input
              type="text"
              value={data.contactName}
              onChange={(e) => updateOpportunity('contactName', e.target.value)}
              placeholder="John Smith"
              className="input-field"
            />
          </div>
          
          <div>
            <label className="input-label">Email</label>
            <input
              type="email"
              value={data.contactEmail}
              onChange={(e) => updateOpportunity('contactEmail', e.target.value)}
              placeholder="john.smith@acme.com"
              className="input-field"
            />
          </div>
          
          <div>
            <label className="input-label">Phone</label>
            <input
              type="tel"
              value={data.contactPhone}
              onChange={(e) => updateOpportunity('contactPhone', e.target.value)}
              placeholder="(555) 123-4567"
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Product Selection */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-3">Product selection</h2>
        <p className="text-gray-600 mb-6">Select one or more products for this opportunity</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {products.map(product => (
            <div
              key={product.id}
              onClick={() => toggleProduct(product.id)}
              className={`product-card ${data.selectedProducts.includes(product.id) ? 'selected' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-bold text-lg leading-tight">{product.name}</h3>
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                  data.selectedProducts.includes(product.id) 
                    ? 'bg-dark-orange border-dark-orange' 
                    : 'border-ck-grey'
                }`}>
                  {data.selectedProducts.includes(product.id) && (
                    <Check size={16} className="text-white" />
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">{product.description}</p>
              <ul className="space-y-2">
                {product.features.map((feature, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-brand-orange font-bold mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Deal Details */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6">Deal details</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="input-label">Fleet size</label>
            <input
              type="number"
              value={data.fleetSize}
              onChange={(e) => updateOpportunity('fleetSize', e.target.value)}
              placeholder="50"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Number of vehicles</p>
          </div>
          
          <div>
            <label className="input-label">Monthly gallons</label>
            <input
              type="number"
              value={data.monthlyGallons}
              onChange={(e) => updateOpportunity('monthlyGallons', e.target.value)}
              placeholder="15000"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">Estimated monthly fuel usage</p>
          </div>
          
          <div>
            <label className="input-label">Target close date</label>
            <input
              type="date"
              value={data.closeDate}
              onChange={(e) => updateOpportunity('closeDate', e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div className="mt-5 p-4 bg-gradient-to-br from-orange-50 to-white border border-brand-orange/30 rounded-xl">
          <h3 className="text-lg font-bold mb-4 text-dark-orange">Pricing Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="input-label">Per gallon discount</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={data.perGallonDiscount}
                  onChange={(e) => updateOpportunity('perGallonDiscount', e.target.value)}
                  placeholder="0.12"
                  className="input-field"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">¢</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Enter discount per gallon (e.g., 0.12 for 12¢)</p>
            </div>

            <div>
              <label className="input-label">Additional cost savings</label>
              <textarea
                value={data.additionalSavings}
                onChange={(e) => updateOpportunity('additionalSavings', e.target.value)}
                placeholder="Reduced admin costs: $500/month&#10;Fleet management fees waived: $200/month"
                rows={3}
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">Optional line items (one per line)</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="input-label">Internal notes</label>
          <textarea
            value={data.notes}
            onChange={(e) => updateOpportunity('notes', e.target.value)}
            placeholder="Customer interested in 50+ vehicle fleet coverage. Looking for immediate implementation..."
            rows={4}
            className="input-field"
          />
          <p className="text-xs text-gray-500 mt-1">These notes are for internal use only and won't appear in the proposal</p>
        </div>
      </div>
    </div>
  )
}
