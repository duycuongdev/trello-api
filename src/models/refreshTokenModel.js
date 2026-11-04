import crypto from 'crypto'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

/**
 * Quản lý vòng đời Refresh Token (rotation + revocation)
 *
 * Nguyên tắc:
 * - Chỉ lưu HASH (sha256) của token trong DB, KHÔNG lưu token gốc:
 *   lộ DB cũng không dùng được token
 * - Mỗi refresh token có trạng thái: active / revoked (kèm replacedByHash khi rotate)
 * - Rotate: token cũ bị thu hồi ngay khi cấp token mới => token bị đánh cắp chỉ dùng được 1 lần
 * - Theft detection: nếu 1 token ĐÃ THU HỒI vẫn được dùng để refresh =>
 *   dấu hiệu token bị đánh cắp => thu hồi TOÀN BỘ token của user đó
 * - TTL index trên expiresAt tự động dọn document hết hạn (xem config/indexes.js)
 */

const REFRESH_TOKEN_COLLECTION_NAME = 'refresh_tokens'

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

const createNew = async ({ userId, token, expiresAt }, { session } = {}) => {
  const docToAdd = {
    userId: new ObjectId(userId),
    tokenHash: hashToken(token),
    expiresAt: new Date(expiresAt),
    revokedAt: null,
    replacedByHash: null,
    createdAt: new Date()
  }
  const result = await GET_DB().collection(REFRESH_TOKEN_COLLECTION_NAME).insertOne(docToAdd, { session })
  return result
}

// Tìm bản ghi theo token gốc (hash lại rồi tra cứu)
const findByTokenHash = async (token) => {
  const result = await GET_DB().collection(REFRESH_TOKEN_COLLECTION_NAME).findOne({ tokenHash: hashToken(token) })
  return result
}

// Thu hồi 1 token (khi rotate: replacedByToken là token mới kế nhiệm)
const revokeByTokenHash = async (token, replacedByToken = null, { session } = {}) => {
  const result = await GET_DB().collection(REFRESH_TOKEN_COLLECTION_NAME).updateOne(
    { tokenHash: hashToken(token) },
    {
      $set: {
        revokedAt: new Date(),
        replacedByHash: replacedByToken ? hashToken(replacedByToken) : null
      }
    },
    { session }
  )
  return result
}

// Thu hồi toàn bộ token của 1 user (đổi mật khẩu / phát hiện token bị đánh cắp)
const revokeAllByUserId = async (userId, { session } = {}) => {
  const result = await GET_DB().collection(REFRESH_TOKEN_COLLECTION_NAME).updateMany(
    { userId: new ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { session }
  )
  return result
}

export const refreshTokenModel = {
  REFRESH_TOKEN_COLLECTION_NAME,
  hashToken,
  createNew,
  findByTokenHash,
  revokeByTokenHash,
  revokeAllByUserId
}
