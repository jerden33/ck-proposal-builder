'use client'

import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader } from 'lucide-react'
import Image from 'next/image'
import { uploadImage, deleteImage } from '@/lib/supabase/storage'

interface ImageUploaderProps {
  currentImageUrl: string | null
  onImageChange: (url: string | null) => void
  folder: 'products' | 'hero' | 'icons'
  label: string
  recommendedSize?: string
  aspectRatio?: string
}

export function ImageUploader({
  currentImageUrl,
  onImageChange,
  folder,
  label,
  recommendedSize = '600x338px',
  aspectRatio = '16:9'
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      const url = await uploadImage(file, folder)
      if (url) {
        onImageChange(url)
      } else {
        setError('Upload failed. Please try again.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    if (!currentImageUrl) return

    if (!confirm('Remove this image?')) return

    setError(null)

    try {
      await deleteImage(currentImageUrl)
      onImageChange(null)
    } catch (err) {
      setError('Failed to remove image')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-off-black">{label}</label>
        <span className="text-xs text-gray-500">
          Recommended: {recommendedSize} ({aspectRatio})
        </span>
      </div>

      {/* Image Display / Placeholder */}
      <div className="relative">
        {currentImageUrl ? (
          /* Uploaded Image Preview */
          <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-white">
            <div className="relative w-full aspect-video">
              <Image
                src={currentImageUrl}
                alt={label}
                fill
                className="object-cover"
                unoptimized
              />
            </div>

            {/* Action Buttons Overlay */}
            {!uploading && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-4 bg-white text-off-black rounded-lg font-medium hover:bg-gray-100 transition-colors text-sm"
                  >
                    Change Image
                  </button>
                  <button
                    onClick={handleRemove}
                    className="py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors text-sm flex items-center gap-2"
                  >
                    <X size={16} />
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Upload Placeholder */
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-brand-orange transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex flex-col items-center justify-center h-full gap-3">
              {uploading ? (
                <>
                  <Loader size={40} className="text-brand-orange animate-spin" />
                  <p className="text-sm font-medium text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                    <Upload size={28} className="text-gray-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">No image uploaded</p>
                    <p className="text-xs text-gray-500 mt-1">Click to upload</p>
                  </div>
                </>
              )}
            </div>
          </button>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <X size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Upload failed</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* File Requirements */}
      {!currentImageUrl && !error && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>• Max file size: 2MB</p>
          <p>• Formats: JPG, PNG, WebP, SVG</p>
        </div>
      )}
    </div>
  )
}
