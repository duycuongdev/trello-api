import { columnModel } from '~/models/columnModel'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import { authorizationService } from '~/services/authorizationService'
import { withTransaction } from '~/utils/withTransaction'

const createNew = async (userId, reqBody) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board mới được tạo column (fix IDOR)
    await authorizationService.requireBoardAccess(userId, reqBody.boardId)

    const newColumn = {
      ...reqBody
    }

    // Insert column + cập nhật columnOrderIds của board phải cùng thành công (atomic)
    return await withTransaction(async (session) => {
      const createColumn = await columnModel.createNew(newColumn, { session })
      const getNewColumn = await columnModel.findOneById(createColumn.insertedId, { session })

      if (getNewColumn) {
        // xử lý cấu trúc data ở đây trước khi trả dữ liệu về
        getNewColumn.cards = []

        // cập nhật mảng columnOrderIds trong collection boards
        await boardModel.pushColumnOrderIds(getNewColumn, { session })
      }

      return getNewColumn
    })
  } catch (error) { throw error }
}

const update = async (userId, columnId, reqBody) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được cập nhật (fix IDOR)
    await authorizationService.requireBoardAccessByColumnId(userId, columnId)

    const updateDate = {
      ...reqBody,
      updatedAt: Date.now()
    }
    const updatedColumn = await columnModel.update(columnId, updateDate)

    return updatedColumn
  } catch (error) { throw error }
}

const deleteItem = async (userId, columnId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được xóa (fix IDOR)
    const { column: targetColumn } = await authorizationService.requireBoardAccessByColumnId(userId, columnId)

    // Xóa column + cards con + pull khỏi board phải atomic, tránh dữ liệu mồ côi
    return await withTransaction(async (session) => {
      // xóa column
      await columnModel.deleteOneById(columnId, { session })

      // xóa cards trong column trên
      await cardModel.deleteManyByColumnId(columnId, { session })

      // xóa columnId trong mảng columnIds của cái board chứa nó
      await boardModel.pullColumnOrderIds(targetColumn, { session })

      return { deleteResult: 'Column and its Cards deleted successfully!' }
    })
  } catch (error) { throw error }
}

const archiveColumn = async (userId, columnId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được lưu trữ (fix IDOR)
    const { column: targetColumn } = await authorizationService.requireBoardAccessByColumnId(userId, columnId)

    return await withTransaction(async (session) => {
      const updatedColumn = await columnModel.update(columnId, {
        _destroy: true,
        updatedAt: Date.now()
      }, { session })

      // Pull columnId from board columnOrderIds
      await boardModel.pullColumnOrderIds(targetColumn, { session })

      return updatedColumn
    })
  } catch (error) { throw error }
}

const restoreColumn = async (userId, columnId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được khôi phục (fix IDOR)
    const { column: targetColumn } = await authorizationService.requireBoardAccessByColumnId(userId, columnId)

    return await withTransaction(async (session) => {
      const updatedColumn = await columnModel.update(columnId, {
        _destroy: false,
        updatedAt: Date.now()
      }, { session })

      // Push columnId back to board columnOrderIds
      await boardModel.pushColumnOrderIds(targetColumn, { session })

      return updatedColumn
    })
  } catch (error) { throw error }
}

export const columnService = {
  createNew,
  update,
  deleteItem,
  archiveColumn,
  restoreColumn
}
