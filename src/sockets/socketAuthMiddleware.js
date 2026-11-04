import { jwtProvider } from '~/providers/JwtProvider'
import { env } from '~/config/environment'
import { userModel } from '~/models/userModel'

/**
 * Middleware xác thực Socket.IO ở bước handshake (mọi connection phải qua bước này)
 * - Nhận accessToken từ handshake.auth.token (Bearer, dành cho mobile/cross-origin)
 *   hoặc từ cookie httpOnly (trình duyệt gửi tự động kèm handshake)
 * - Không hợp lệ thì từ chối connection ngay từ đầu
 * - Hợp lệ thì gắn thông tin user đã xác thực từ DB vào socket.user
 *   (từ đó các event KHÔNG được tin vào object user do client tự gửi)
 */

// Parse thủ công giá trị cookie từ header (tránh thêm dependency mới)
const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return rest.join('=')
      }
    }
  }
  return null
}

export const socketAuthMiddleware = async (socket, next) => {
  try {
    let token = socket.handshake?.auth?.token || null
    if (!token) {
      token = getCookieValue(socket.handshake?.headers?.cookie, 'accessToken')
    }
    if (!token) {
      return next(new Error('Unauthorized: token not found'))
    }

    const decoded = await jwtProvider.verifyToken(token, env.ACCESS_TOKEN_SECRET_SIGNATURE)

    // Lấy user thật từ DB - tuyệt đối không dùng thông tin user do client gửi lên
    const user = await userModel.findOneById(decoded?._id)
    if (!user || user._destroy || !user.isActive) {
      return next(new Error('Unauthorized: user not found or deactivated'))
    }

    socket.user = {
      _id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar
    }
    return next()
  } catch (error) {
    return next(new Error('Unauthorized: invalid or expired token'))
  }
}
