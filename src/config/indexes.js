import { GET_DB } from '~/config/mongodb'
import { logger } from '~/utils/logger'

/**
 * Khai báo các index cho các collection
 * - Tăng tốc các query $lookup / $match theo boardId, columnId, memberIds...
 * - Unique index email chặn trùng lặp tài khoản ở tầng DB (race condition khi 2 request đăng ký song song)
 * - createIndexes là idempotent (đã tồn tại thì bỏ qua) nên chạy an toàn mỗi lần khởi động
 *
 * LƯU Ý: lỗi tạo index chỉ được log và KHÔNG làm sập server
 * (ví dụ unique index thất bại do dữ liệu cũ đang có email trùng - cần xử lý dữ liệu thủ công)
 */

const INDEX_DEFINITIONS = [
  {
    collection: 'users',
    indexes: [
      { key: { email: 1 }, unique: true, name: 'uniq_email' }
    ]
  },
  {
    collection: 'boards',
    indexes: [
      { key: { ownerIds: 1 }, name: 'idx_ownerIds' },
      { key: { memberIds: 1 }, name: 'idx_memberIds' },
      { key: { _destroy: 1, title: 1 }, name: 'idx_destroy_title' }
    ]
  },
  {
    collection: 'columns',
    indexes: [
      { key: { boardId: 1 }, name: 'idx_boardId' }
    ]
  },
  {
    collection: 'cards',
    indexes: [
      { key: { boardId: 1 }, name: 'idx_boardId' },
      { key: { columnId: 1 }, name: 'idx_columnId' },
      { key: { memberIds: 1, dueDate: 1 }, name: 'idx_memberIds_dueDate' }
    ]
  },
  {
    collection: 'invitations',
    indexes: [
      { key: { inviteeId: 1 }, name: 'idx_inviteeId' },
      { key: { inviterId: 1 }, name: 'idx_inviterId' },
      { key: { 'boardInvitation.boardId': 1 }, name: 'idx_boardInvitation_boardId' }
    ]
  },
  {
    collection: 'refresh_tokens',
    indexes: [
      { key: { tokenHash: 1 }, unique: true, name: 'uniq_tokenHash' },
      { key: { userId: 1 }, name: 'idx_userId' },
      // TTL index: MongoDB tự động xóa document khi quá expiresAt
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_expiresAt' }
    ]
  }
]

export const CREATE_DB_INDEXES = async () => {
  const db = GET_DB()

  for (const { collection, indexes } of INDEX_DEFINITIONS) {
    try {
      const created = await db.collection(collection).createIndexes(indexes)
      // eslint-disable-next-line no-console
      logger.info(`[DB Indexes] ${collection}: ${created.numIndexesAfter ?? 'ok'} indexes ensured`)
    } catch (error) {
      // Không chặn startup: index chỉ là tối ưu / ràng buộc, lỗi thường do dữ liệu cũ vi phạm unique
      // eslint-disable-next-line no-console
      logger.error(`[DB Indexes] FAILED on ${collection}:`, error?.message || error)
    }
  }
}
