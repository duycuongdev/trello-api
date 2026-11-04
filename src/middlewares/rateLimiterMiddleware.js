import rateLimit from 'express-rate-limit'
import { StatusCodes } from 'http-status-codes'

// 1. Chống Brute Force đăng nhập: Giới hạn 10 lần đăng nhập thất bại trong 15 phút trên mỗi IP
// Sử dụng skipSuccessfulRequests: true để chỉ tính các lần đăng nhập thất bại
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10,
  skipSuccessfulRequests: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    message: 'Too many failed login attempts from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// 2. Chống Spam đăng ký tài khoản ảo/rác: Tối đa 5 tài khoản đăng ký trong 1 giờ trên mỗi IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    message: 'Too many accounts created from this IP. Please try again after 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// 3. Giới hạn số lần gửi lời mời tham gia board: tối đa 30 lần trong 15 phút trên mỗi IP
const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    message: 'Too many invitations sent from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// 4. Rate Limiter chung cho toàn bộ API v1 để chống Flood / DDoS / Scraping: 600 requests trong 15 phút
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    message: 'Too many requests from this IP. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

// 5. Chống spam yêu cầu đặt lại mật khẩu (lạm dụng gửi email): tối đa 5 lần trong 1 giờ trên mỗi IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    message: 'Too many password reset requests from this IP. Please try again after 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

export const rateLimiterMiddleware = {
  loginLimiter,
  registerLimiter,
  invitationLimiter,
  passwordResetLimiter,
  apiLimiter
}
