/**
 * Socket.io cho thông báo cá nhân: lời mời tham gia board, cảnh báo deadline thẻ
 *
 * Bảo mật:
 * - FE_USER_JOIN_ROOM: chỉ cho phép join phòng cá nhân của CHÍNH user đã xác thực,
 *   không chấp nhận userId client gửi lên (trước đây bất kỳ ai cũng có thể nghe trộm
 *   thông báo của người khác bằng cách join phòng userId tùy ý)
 * - Các sự kiện relay (mời / deadline) chỉ được phát bởi owner/member của board liên quan
 */

import { authorizationService } from '~/services/authorizationService'

export const inviteUserToBoardSocket = (socket) => {
  // Lắng nghe sự kiện client đăng ký phòng cá nhân theo userId
  // Chỉ join đúng phòng của user đã xác thực ở handshake, bỏ qua userId client gửi
  socket.on('FE_USER_JOIN_ROOM', () => {
    if (socket.user?._id) {
      socket.join(socket.user._id)
    }
  })

  // Chỉ relay thông báo mời nếu người gửi là owner/member của board trong invitation
  socket.on('FE_USER_INVITED_TO_BOARD', async (invitation) => {
    if (!socket.user) return
    const inviteeId = invitation?.inviteeId
    const boardId = invitation?.boardInvitation?.boardId || invitation?.boardId
    if (!inviteeId || !boardId) return

    try {
      await authorizationService.requireBoardAccess(socket.user._id, boardId)
    } catch {
      return // Không thuộc board này => im lặng chặn, không relay
    }

    // Chỉ gửi thông báo tới đúng room của người được mời (inviteeId), tránh rò rỉ dữ liệu ra toàn hệ thống
    socket.to(inviteeId.toString()).emit('BE_USER_INVITED_TO_BOARD', invitation)
  })

  // Lắng nghe sự kiện cập nhật deadline / hạn thẻ để báo cho các thành viên trong thẻ
  // Chỉ relay nếu người gửi là owner/member của board chứa card
  socket.on('FE_CARD_DUE_DATE_CHANGED', async ({ recipientIds, card, boardTitle } = {}) => {
    if (!socket.user) return
    if (!Array.isArray(recipientIds) || !card?.boardId) return

    try {
      await authorizationService.requireBoardAccess(socket.user._id, card.boardId)
    } catch {
      return
    }

    recipientIds.forEach((recipientId) => {
      if (recipientId) {
        socket.to(recipientId.toString()).emit('BE_CARD_DUE_DATE_CHANGED', { card, boardTitle })
      }
    })
  })
}
