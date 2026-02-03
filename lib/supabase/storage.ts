import { createClient } from './client'

export async function uploadImage(
  file: File,
  folder: 'products' | 'hero' | 'icons'
): Promise<string | null> {
  try {
    // Validate file size
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      throw new Error('File too large (max 2MB)')
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Please use JPG, PNG, WebP, or SVG')
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${timestamp}-${sanitizedName}`
    const filePath = `${folder}/${filename}`

    const supabase = createClient()

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('proposal-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('proposal-assets')
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    console.error('Upload error:', error)
    throw error
  }
}

export async function deleteImage(url: string): Promise<boolean> {
  try {
    // Extract path from URL
    const urlParts = url.split('/proposal-assets/')
    if (urlParts.length < 2) return false

    const path = urlParts[1]
    if (!path) return false

    const supabase = createClient()

    const { error } = await supabase.storage
      .from('proposal-assets')
      .remove([path])

    if (error) {
      console.error('Delete error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Delete error:', error)
    return false
  }
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
