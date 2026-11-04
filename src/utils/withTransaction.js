import { GET_DB } from '~/config/mongodb'

/**
 * Chạy các thao tác ĐA-DOCUMENT trong 1 MongoDB transaction (nguyên tố - atomic):
 * - Thành công hết => tự động commit
 * - Bất kỳ thao tác nào lỗi => tự động abort, toàn bộ thay đổi đã thực hiện được ROLLBACK
 *   (tránh dữ liệu mồ côi: card tồn tại nhưng thiếu trong cardOrderIds, board xóa dở, v.v.)
 * - session.withTransaction tự động retry các lỗi tạm thời (transient) của replica set
 *
 * YÊU CẦU: MongoDB phải chạy dưới dạng replica set (MongoDB Atlas mặc định là replica set).
 * Cách dùng:
 *   return await withTransaction(async (session) => {
 *     await modelA.write(..., { session })
 *     await modelB.write(..., { session })
 *     return result
 *   })
 */
export const withTransaction = async (operations) => {
  const session = GET_DB().client.startSession()
  try {
    let result
    await session.withTransaction(
      async () => {
        result = await operations(session)
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority' }
      }
    )
    return result
  } finally {
    await session.endSession()
  }
}
