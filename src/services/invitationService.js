import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { userModel } from '~/models/userModel'
import { boardModel } from '~/models/boardModel'
import { invitationModel } from '~/models/invitationModel'
import { cardModel } from '~/models/cardModel'
import { INVITATION_TYPES, BOARD_INVITATION_STATUS } from '~/utils/constants'
import { pickUser } from '~/utils/formatter'
import { withTransaction } from '~/utils/withTransaction'

const createNewBoardInvitation = async (reqBody, inviterId) => {
  try {
    const inviter = await userModel.findOneById(inviterId)
    const invitee = await userModel.findOneByEmail(reqBody.inviteeEmail)
    const board = await boardModel.findOneById(reqBody.boardId)

    if (!invitee || !inviter || !board) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'Inviter, Invitee or Board not found!'
      )
    }

    // Không cho phép tự mời chính mình
    if (inviterId.toString() === invitee._id.toString()) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot invite yourself to the board!')
    }

    // Kiểm tra xem inviter có phải là owner hoặc member của board hay không
    const isMemberOrOwner = [
      ...(board.ownerIds || []),
      ...(board.memberIds || [])
    ].some(id => id.toString() === inviterId.toString())

    if (!isMemberOrOwner) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to invite users to this board!')
    }

    // Kiểm tra xem invitee đã là thành viên hoặc owner của board chưa
    const isInviteeAlreadyMember = [
      ...(board.ownerIds || []),
      ...(board.memberIds || [])
    ].some(id => id.toString() === invitee._id.toString())

    if (isInviteeAlreadyMember) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'User is already a member of this board!')
    }

    const newInvitationData = {
      inviterId,
      inviteeId: invitee._id.toString(),
      type: INVITATION_TYPES.BOARD_INVITATION,
      boardInvitation: {
        boardId: board._id.toString(),
        status: BOARD_INVITATION_STATUS.PENDING
      }
    }

    const createdInvitation = await invitationModel.createNewBoardInvitation(newInvitationData)
    const getInvitation = await invitationModel.findOneById(createdInvitation.insertedId)

    const resInvitation = {
      ...getInvitation,
      board,
      inviter: pickUser(inviter),
      invitee: pickUser(invitee)
    }

    return resInvitation
  } catch (error) {
    throw error
  }
}

const getInvitations = async (userId) => {
  try {
    const getInvitations = await invitationModel.findByUser(userId)
    const resInvitations = getInvitations.map(i => ({
      ...i,
      type: 'BOARD_INVITATION',
      inviter: i.inviter[0] || {},
      invitee: i.invitee[0] || {},
      board: i.board[0] || {}
    }))

    // Lấy thêm các thông báo deadline (quá hạn hoặc sắp hết hạn) của user hiện tại
    const dueCards = await cardModel.findDueCardsByUser(userId)

    const allNotifications = [...dueCards, ...resInvitations]
    // Sắp xếp thông báo mới nhất lên đầu tiên (createdAt giảm dần)
    allNotifications.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.dueDate || 0).getTime()
      const timeB = new Date(b.createdAt || b.dueDate || 0).getTime()
      return timeB - timeA
    })

    return allNotifications
  } catch (error) { throw error }
}

const updateBoardInvitation = async (userId, invitationId, status) => {
  try {
    const getInvitation = await invitationModel.findOneById(invitationId)
    if (!getInvitation) throw new ApiError(StatusCodes.NOT_FOUND, 'Invitation not found!')

    // IDOR Protection: Chỉ đúng người được mời (invitee) mới có quyền accept/reject lời mời
    if (getInvitation.inviteeId.toString() !== userId.toString()) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to update this invitation!')
    }

    const boardId = getInvitation.boardInvitation.boardId
    const getBoard = await boardModel.findOneById(boardId)
    if (!getBoard) throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found!')

    // Kiểm tra chính xác xem user đã là owner hoặc member chưa
    const isAlreadyMember = [
      ...(getBoard.ownerIds || []),
      ...(getBoard.memberIds || [])
    ].some(id => id.toString() === userId.toString())

    if (status === BOARD_INVITATION_STATUS.ACCEPTED && isAlreadyMember) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'You are already a member of this board!')
    }

    const updateData = {
      boardInvitation: {
        ...getInvitation.boardInvitation,
        status: status
      }
    }

    // Update trạng thái lời mời + push member vào board phải atomic:
    // nếu chỉ xong 1 thao tác sẽ sinh lời mời "accepted" nhưng user không vào được board (hoặc ngược lại)
    return await withTransaction(async (session) => {
      const updatedInvitation = await invitationModel.update(invitationId, updateData, { session })

      if (updatedInvitation.boardInvitation.status === BOARD_INVITATION_STATUS.ACCEPTED) {
        await boardModel.pushMemberIds(boardId, userId, { session })
      }

      return updatedInvitation
    })
  } catch (error) { throw error }
}

export const invitationService = {
  createNewBoardInvitation,
  getInvitations,
  updateBoardInvitation
}
