import { columnModel } from '~/models/columnModel'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { authorizationService } from '~/services/authorizationService'

const createNew = async (userId, reqBody) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board mới được tạo column (fix IDOR)
    await authorizationService.requireBoardAccess(userId, reqBody.boardId)

    const newColumn = {
      ...reqBody
    }
    const createColumn = await columnModel.createNew(newColumn)
    const getNewColumn = await columnModel.findOneById(createColumn.insertedId)

    if (getNewColumn) {
      // xử lý cấu trúc data ở đây trước khi trả dữ liệu về
      getNewColumn.cards = []

      // cập nhật mảng columnOrderIds trong collection boards
      await boardModel.pushColumnOrderIds(getNewColumn)
    }

    return getNewColumn
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
    if (!targetColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Column not found!')
    }

    // xóa column
    await columnModel.deleteOneById(columnId)

    // xóa cards trong column trên
    await cardModel.deleteManyByColumnId(columnId)

    // xóa columnId trong mảng columnIds của cái board chứa nó
    await boardModel.pullColumnOrderIds(targetColumn)

    return { deleteResult: 'Column and its Cards deleted successfully!' }
  } catch (error) { throw error }
}

const archiveColumn = async (userId, columnId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được lưu trữ (fix IDOR)
    const { column: targetColumn } = await authorizationService.requireBoardAccessByColumnId(userId, columnId)
    if (!targetColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Column not found!')
    }

    const updatedColumn = await columnModel.update(columnId, {
      _destroy: true,
      updatedAt: Date.now()
    })

    // Pull columnId from board columnOrderIds
    await boardModel.pullColumnOrderIds(targetColumn)

    return updatedColumn
  } catch (error) { throw error }
}

const restoreColumn = async (userId, columnId) => {
  try {
    // Kiểm tra quyền: chỉ Owner hoặc Member của board chứa column mới được khôi phục (fix IDOR)
    const { column: targetColumn } = await authorizationService.requireBoardAccessByColumnId(userId, columnId)
    if (!targetColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Column not found!')
    }

    const updatedColumn = await columnModel.update(columnId, {
      _destroy: false,
      updatedAt: Date.now()
    })

    // Push columnId back to board columnOrderIds
    await boardModel.pushColumnOrderIds(targetColumn)

    return updatedColumn
  } catch (error) { throw error }
}

export const columnService = {
  createNew,
  update,
  deleteItem,
  archiveColumn,
  restoreColumn
}