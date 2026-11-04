/**
 * Quản lý Socket.io cho tính năng Real-time Board Collaboration
 * - Quản lý phòng (Room) theo từng board: board_{boardId}
 * - Theo dõi danh sách thành viên đang trực tuyến xem bảng (Active Viewers)
 * - Broadcast các thao tác thay đổi bảng (kéo thả column, kéo thả card, tạo/sửa/xóa card, v.v.)
 *
 * Bảo mật:
 * - Mọi connection đã được xác thực ở handshake (socketAuthMiddleware) => socket.user là user thật từ DB
 * - Không tin vào object user client gửi lên khi join phòng
 * - Chỉ owner/member của board mới được vào phòng board
 * - Chỉ socket đã được xác minh membership và join phòng hợp lệ mới được broadcast sự kiện
 */

import { authorizationService } from '~/services/authorizationService'

// Lưu trữ người dùng đang online theo từng Board: Map<boardId, Map<socketId, user>>
const activeBoardUsers = new Map()

// io instance được server.js đăng ký sau khi khởi tạo (để service layer có thể bắn sự kiện)
let ioInstance = null
export const setSocketServerInstance = (io) => {
  ioInstance = io
}

/**
 * KICK user khỏi phòng board khi bị remove khỏi board (gọi từ service layer):
 * - Buộc mọi socket của user đó rời room board_{boardId} + dọn activeBoardUsers
 * - Thông báo BE_BOARD_MEMBER_REMOVED tới phòng cá nhân của user (room = userId)
 *   để FE điều hướng ra khỏi bảng + hiện thông báo
 */
export const kickUserFromBoard = (userId, boardId) => {
  if (!ioInstance || !userId || !boardId) return

  const roomName = `board_${boardId}`
  if (activeBoardUsers.has(boardId)) {
    const userMap = activeBoardUsers.get(boardId)
    for (const [socketId, user] of userMap) {
      if (user._id?.toString() === userId.toString()) {
        const sock = ioInstance.sockets.sockets.get(socketId)
        if (sock) {
          sock.leave(roomName)
          sock.joinedBoardIds?.delete(boardId)
        }
        userMap.delete(socketId)
      }
    }
    if (userMap.size === 0) {
      activeBoardUsers.delete(boardId)
    } else {
      ioInstance.to(roomName).emit('BE_BOARD_USERS_ONLINE', getUniqueOnlineUsers(boardId))
    }
  }

  // Báo cho chính user bị xóa (họ join phòng cá nhân userId khi đăng nhập)
  ioInstance.to(userId.toString()).emit('BE_BOARD_MEMBER_REMOVED', { boardId })
}

const getUniqueOnlineUsers = (boardId) => {
  if (!activeBoardUsers.has(boardId)) return []
  const userMap = activeBoardUsers.get(boardId)
  const uniqueUsers = new Map()
  userMap.forEach((user) => {
    if (user && user._id) {
      uniqueUsers.set(user._id.toString(), user)
    }
  })
  return Array.from(uniqueUsers.values())
}

const cleanupUserFromBoard = (socket, io, boardId) => {
  if (!boardId || !activeBoardUsers.has(boardId)) return

  const userMap = activeBoardUsers.get(boardId)
  userMap.delete(socket.id)

  const roomName = `board_${boardId}`
  if (userMap.size === 0) {
    activeBoardUsers.delete(boardId)
  } else {
    io.to(roomName).emit('BE_BOARD_USERS_ONLINE', getUniqueOnlineUsers(boardId))
  }
}

export const boardSocket = (socket, io) => {
  // Ghi nhận các board room mà socket này đã được server xác minh membership rồi
  // (dùng để chặn broadcast từ socket chưa join hợp lệ mà không cần query DB mỗi event)
  socket.joinedBoardIds = new Set()

  // Client tham gia vào phòng của một Board cụ thể
  socket.on('FE_USER_JOIN_BOARD_ROOM', async ({ boardId } = {}) => {
    if (!boardId || !socket.user) return

    // Kiểm tra quyền: chỉ Owner/Member của board mới được vào phòng (không tin user client gửi)
    try {
      await authorizationService.requireBoardAccess(socket.user._id, boardId)
    } catch {
      socket.emit('BE_BOARD_JOIN_ERROR', {
        boardId,
        message: 'You do not have permission to join this board room!'
      })
      return
    }

    const roomName = `board_${boardId}`
    socket.join(roomName)
    socket.joinedBoardIds.add(boardId)

    // Lưu thông tin user đã xác thực từ server (bỏ qua hoàn toàn object user do client gửi)
    if (!activeBoardUsers.has(boardId)) {
      activeBoardUsers.set(boardId, new Map())
    }
    activeBoardUsers.get(boardId).set(socket.id, socket.user)

    // Gửi danh sách người dùng đang online trên bảng cho toàn bộ client trong phòng
    io.to(roomName).emit('BE_BOARD_USERS_ONLINE', getUniqueOnlineUsers(boardId))
  })

  // Client chủ động rời khỏi phòng của Board (ví dụ chuyển trang khác)
  socket.on('FE_USER_LEAVE_BOARD_ROOM', ({ boardId } = {}) => {
    if (!boardId) return

    const roomName = `board_${boardId}`
    socket.leave(roomName)
    socket.joinedBoardIds.delete(boardId)
    cleanupUserFromBoard(socket, io, boardId)
  })

  // Broadcast các thao tác thay đổi dữ liệu của Board tới tất cả người dùng khác đang xem
  // data gồm: { boardId, actionType, payload }
  socket.on('FE_BOARD_UPDATED', (data) => {
    if (!socket.user) return
    if (!data?.boardId || !socket.joinedBoardIds.has(data.boardId)) return

    const roomName = `board_${data.boardId}`
    // Ép buộc sender identity từ thông tin đã xác thực trên server, không tin client gửi
    const safeData = {
      ...data,
      senderId: socket.user._id,
      senderName: socket.user.displayName || socket.user.email
    }
    // Phát sự kiện tới tất cả thành viên trong phòng ngoại trừ người gửi
    socket.to(roomName).emit('BE_BOARD_UPDATED', safeData)
  })

  // Xử lý khi socket ngắt kết nối bất ngờ (tắt tab, mất mạng)
  socket.on('disconnect', () => {
    if (socket.joinedBoardIds) {
      socket.joinedBoardIds.forEach((boardId) => {
        cleanupUserFromBoard(socket, io, boardId)
      })
    }
  })
}
