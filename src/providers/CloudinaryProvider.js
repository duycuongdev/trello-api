import cloudinary from 'cloudinary'
import streamifier from 'streamifier'
import { env } from '~/config/environment'
import { logger } from '~/utils/logger'

// config cloudinary
const cloudinaryV2 = cloudinary.v2
cloudinaryV2.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
})

// initialize cloudinary upload stream
const streamUpload = (fileBuffer, folderName) => {
  return new Promise((resolve, reject) => {
    // Tạo một cái luồng stream upload lên cloudinary, hỗ trợ đa định dạng (ảnh, pdf, tài liệu)
    const stream = cloudinaryV2.uploader.upload_stream(
      { folder: folderName, resource_type: 'auto' },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      }
    )
    // Thực hiện upload cái luồng trên bằng lib streamifier
    streamifier.createReadStream(fileBuffer).pipe(stream)
  })
}

/**
 * Trích xuất public_id từ URL Cloudinary
 * Ví dụ: https://res.cloudinary.com/cloud_name/image/upload/v12345/cardAttachments/xyz.png -> cardAttachments/xyz
 */
const getPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return null
  try {
    const parts = url.split('/upload/')
    if (parts.length < 2) return null
    // Bỏ phần version (v12345678/) nếu có
    const pathAfterUpload = parts[1].replace(/^v\d+\//, '')
    // Bỏ extension cuối (.png, .jpg, v.v.)
    const lastDotIndex = pathAfterUpload.lastIndexOf('.')
    return lastDotIndex !== -1 ? pathAfterUpload.substring(0, lastDotIndex) : pathAfterUpload
  } catch {
    return null
  }
}

/**
 * Xóa file trên Cloudinary để tránh rác dung lượng lưu trữ (Orphaned Assets)
 */
const deleteFile = async (fileUrlOrPublicId) => {
  try {
    if (!fileUrlOrPublicId) return null
    const publicId = fileUrlOrPublicId.includes('http')
      ? getPublicIdFromUrl(fileUrlOrPublicId)
      : fileUrlOrPublicId

    if (!publicId) return null

    // Thử xóa với resource_type='image' trước, nếu không tìm thấy thì thử tiếp với 'raw'
    let result = await cloudinaryV2.uploader.destroy(publicId, { resource_type: 'image' })
    if (result?.result === 'not found') {
      result = await cloudinaryV2.uploader.destroy(publicId, { resource_type: 'raw' })
    }
    return result
  } catch (error) {
    logger.error('[Cloudinary] Failed to delete file:', error?.message || error)
    return null
  }
}

export const cloudinaryProvider = { streamUpload, deleteFile, getPublicIdFromUrl }
