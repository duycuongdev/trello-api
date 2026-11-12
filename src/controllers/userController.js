import { StatusCodes } from 'http-status-codes'
import { userService } from '~/services/userService'
import ms from 'ms'
import ApiError from '~/utils/ApiError'
import { pickUser } from '~/utils/formatter'

/**
 * Gắn cặp token (access + refresh) vào HttpOnly cookies sau khi đăng nhập/refresh.
 * Dùng chung cho login, guest_login, google-login và refresh_token để tránh lặp code.
 */
const setAuthCookies = (res, result) => {
  res.cookie('accessToken', result.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: ms('14d')
  })

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: ms('14d')
  })
}

const createNew = async (req, res, next) => {
  try {
    const createdUser = await userService.createNew(req.body)
    res.status(StatusCodes.CREATED).json(createdUser)
  } catch (error) { next(error) }
}

const verifyAccount = async (req, res, next) => {
  try {
    const result = await userService.verifyAccount(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const login = async (req, res, next) => {
  try {
    const result = await userService.login(req.body)

    setAuthCookies(res, result)

    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const guestLogin = async (req, res, next) => {
  try {
    const result = await userService.guestLogin()

    setAuthCookies(res, result)

    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const googleLogin = async (req, res, next) => {
  try {
    const result = await userService.googleLogin(req.body)

    setAuthCookies(res, result)

    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const logout = async (req, res, next) => {
  try {
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }

    // Thu hồi refresh token ở DB (nếu client có gửi) trước khi xóa cookie
    // Dual-auth: cookie httpOnly | x-refresh-token header | Bearer Authorization | body
    const bearer = req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null
    const clientRefreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'] || bearer || req.body?.refreshToken
    await userService.logout(clientRefreshToken)

    // Xóa cookie với đầy đủ options tương ứng để trình duyệt chấp thuận xóa
    res.clearCookie('accessToken', cookieOptions)
    res.clearCookie('refreshToken', cookieOptions)

    res.status(StatusCodes.OK).json({ loggedOut: true })
  } catch (error) { next(error) }
}

const refreshToken = async (req, res, next) => {
  try {
    // Dual-auth: cookie httpOnly | x-refresh-token header | Bearer Authorization | body
    const bearer = req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null
    const clientRefreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'] || bearer || req.body?.refreshToken
    const result = await userService.refreshToken(clientRefreshToken)
    // ROTATION: set luôn cookie refreshToken mới (token cũ đã bị thu hồi ở service)
    setAuthCookies(res, result)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(new ApiError(StatusCodes.UNAUTHORIZED, error?.message || 'Please Sign In!'))
  }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const userAvatarFile = req.file
    const updatedUser = await userService.update(userId, req.body, userAvatarFile)
    res.status(StatusCodes.OK).json(updatedUser)
  } catch (error) { next(error) }
}

const getProfile = async (req, res, next) => {
  try {
    res.status(StatusCodes.OK).json(pickUser(req.currentUser))
  } catch (error) { next(error) }
}

const forgotPassword = async (req, res, next) => {
  try {
    const result = await userService.forgotPassword(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const resetPassword = async (req, res, next) => {
  try {
    const result = await userService.resetPassword(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const userController = {
  createNew,
  verifyAccount,
  login,
  guestLogin,
  googleLogin,
  logout,
  refreshToken,
  update,
  getProfile,
  forgotPassword,
  resetPassword
}
