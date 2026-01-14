'use client'

import { useState } from 'react'
import { OpportunityData, products as productList } from '@/lib/types'
import { Check, X, Plus, ChevronDown, ChevronUp } from 'lucide-react'

interface OpportunityStepProps {
  data: OpportunityData
  products: typeof productList
  updateOpportunity: (field: keyof OpportunityData, value: string | string[]) => void
  toggleProduct: (productId: string) => void
  addProductFeature: (productId: string) => void
  removeProductFeature: (productId: string, index: number) => void
  updateProductFeature: (productId: string, index: number, value: string) => void
}

export function OpportunityStep({
  data,
  products,
  updateOpportunity,
  toggleProduct,
  addProductFeature,
  removeProductFeature,
  updateProductFeature
}: OpportunityStepProps) {
  const [expandedProducts, setExpandedProducts] = useState<{ [key: string]: boolean }>({})

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }))
  }

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

        <div className="space-y-6">
          {products.map(product => {
            const isSelected = data.selectedProducts.includes(product.id)
            const isExpanded = expandedProducts[product.id]
            const customFeatures = data.customProductFeatures[product.id] || []

            return (
              <div key={product.id} className="border-2 border-gray-200 rounded-xl overflow-hidden transition-all">
                {/* Product Card Header */}
                <div
                  onClick={() => toggleProduct(product.id)}
                  className={`p-6 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-gradient-to-br from-brand-orange to-dark-orange text-white'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className={`font-bold text-xl leading-tight ${isSelected ? 'text-white' : 'text-off-black'}`}>
                      {product.name}
                    </h3>
                    <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      isSelected
                        ? 'bg-white border-white'
                        : 'border-gray-300'
                    }`}>
                      {isSelected && (
                        <Check size={18} className="text-dark-orange" />
                      )}
                    </div>
                  </div>
                  <p className={`text-sm leading-relaxed ${isSelected ? 'text-white/90' : 'text-gray-600'}`}>
                    {product.description}
                  </p>
                </div>

                {/* Feature Editor - Only show if selected */}
                {isSelected && (
                  <div className="border-t-2 border-gray-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpanded(product.id)
                      }}
                      className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="font-semibold text-off-black">
                        {isExpanded ? 'Hide' : 'Customize'} Product Features
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={20} className="text-gray-600" />
                      ) : (
                        <ChevronDown size={20} className="text-gray-600" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-6 bg-white space-y-4">
                        {/* Tip */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                          <p className="text-sm text-blue-800">
                            <strong>💡 Tip:</strong> Don't include pricing or discount amounts here. Use the pricing section below for discounts and cost savings.
                          </p>
                        </div>

                        {/* Feature List */}
                        <div className="space-y-3">
                          {customFeatures.map((feature, index) => (
                            <div key={index} className="flex items-start gap-3">
                              <span className="text-brand-orange font-bold text-lg mt-1">•</span>
                              <input
                                type="text"
                                value={feature}
                                onChange={(e) => updateProductFeature(product.id, index, e.target.value)}
                                placeholder="Enter feature..."
                                className="flex-1 input-field"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeProductFeature(product.id, index)
                                }}
                                className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors mt-1"
                                title="Remove feature"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add Feature Button */}
                        {customFeatures.length < 10 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              addProductFeature(product.id)
                            }}
                            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-brand-orange hover:bg-orange-50 transition-all flex items-center justify-center gap-2 text-gray-600 hover:text-brand-orange font-medium"
                          >
                            <Plus size={18} />
                            Add Feature
                          </button>
                        )}

                        {customFeatures.length >= 10 && (
                          <p className="text-sm text-gray-500 text-center">
                            Maximum of 10 features reached
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
