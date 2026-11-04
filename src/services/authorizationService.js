import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { boardModel } from '~/models/boardModel'
import { columnModel } from '~/models/columnModel'
import { cardModel } from '~/models/cardModel'

/**
 * Tập trung kiểm tra quyền truy cập theo Board (fix lỗ hổng IDOR / Broken Access Control)
 * Nguyên tắc: mọi thao tác đọc / thay đổi Board, Column, Card đều phải xác minh
 * user hiện tại là Owner hoặc Member của Board chứa dữ liệu đó trước khi thực hiện.
 */
const isUserInBoard = (board, userId) => {
  const userIdStr = userId?.toString()
  if (!board || !userIdStr) return false

  const isOwner = (board.ownerIds || []).some(id => id.toString() === userIdStr)
  const isMember = (board.memberIds || []).some(id => id.toString() === userIdStr)
  return isOwner || isMember
}

// Kiểm tra quyền truy cập 1 Board theo boardId, trả về document Board nếu hợp lệ
const requireBoardAccess = async (userId, boardId) => {
  const board = await boardModel.findOneById(boardId)
  if (!board) throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found!')
  if (!isUserInBoard(board, userId)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to access this board!')
  }
  return board
}

// Kiểm tra quyền truy cập Board chứa 1 Column (dựa theo columnId), trả về { board, column }
const requireBoardAccessByColumnId = async (userId, columnId) => {
  const column = await columnModel.findOneById(columnId)
  if (!column) throw new ApiError(StatusCodes.NOT_FOUND, 'Column not found!')
  const board = await requireBoardAccess(userId, column.boardId)
  return { board, column }
}

// Kiểm tra quyền truy cập Board chứa 1 Card (dựa theo cardId), trả về { board, card }
const requireBoardAccessByCardId = async (userId, cardId) => {
  const card = await cardModel.findOneById(cardId)
  if (!card) throw new ApiError(StatusCodes.NOT_FOUND, 'Card not found!')
  const board = await requireBoardAccess(userId, card.boardId)
  return { board, card }
}

export const authorizationService = {
  isUserInBoard,
  requireBoardAccess,
  requireBoardAccessByColumnId,
  requireBoardAccessByCardId
}
