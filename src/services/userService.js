import { StatusCodes } from 'http-status-codes'
import { logger } from '~/utils/logger'
import ApiError from '~/utils/ApiError'
import { userModel } from '~/models/userModel'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { pickUser } from '~/utils/formatter'
import { WEBSITE_DOMAINS } from '~/utils/constants'
import { brevoProvider } from '~/providers/BrevoProvider'
import { jwtProvider } from '~/providers/JwtProvider'
import { env } from '~/config/environment'
import { cloudinaryProvider } from '~/providers/CloudinaryProvider'
import { refreshTokenModel } from '~/models/refreshTokenModel'
import { withTransaction } from '~/utils/withTransaction'
import { OAuth2Client } from 'google-auth-library'
import ms from 'ms'

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID)

/**
 * Tạo cặp accessToken + refreshToken mới cho user và LƯU BẢN GHI refresh token vào DB
 * (để có thể rotate/thu hồi; chỉ lưu hash của token, không lưu token gốc)
 */
const issueTokenPair = async (user) => {
  const userInfo = { _id: user._id, email: user.email }

  // jti (JWT ID): định danh duy nhất cho từng token. Nếu không có, 2 token sinh ra
  // trong cùng 1 giây cho cùng user sẽ GIỐNG HỆT nhau (trùng iat + payload)
  // => vi phạm unique index refresh_tokens và token bị tái sử dụng vô tình.
  const accessToken = jwtProvider.generateToken(
    { ...userInfo, jti: uuidv4() },
    env.ACCESS_TOKEN_SECRET_SIGNATURE,
    env.ACCESS_TOKEN_LIFE
  )
  const refreshToken = jwtProvider.generateToken(
    { ...userInfo, jti: uuidv4() },
    env.REFRESH_TOKEN_SECRET_SIGNATURE,
    env.REFRESH_TOKEN_LIFE
  )

  await refreshTokenModel.createNew({
    userId: user._id.toString(),
    token: refreshToken,
    expiresAt: Date.now() + ms(env.REFRESH_TOKEN_LIFE || '14d')
  })

  return { accessToken, refreshToken }
}

const createNew = async (reqBody) => {
  try {
    // kiểm tra xem email đã tồn tại chưa
    const existUser = await userModel.findOneByEmail(reqBody.email)
    let userToProcess = null

    if (existUser) {
      if (existUser.isActive) {
        throw new ApiError(StatusCodes.CONFLICT, 'Email already exists and is already verified!')
      }
      // Trường hợp tài khoản đã tạo trước đó nhưng chưa verify (ví dụ do lỗi gửi email)
      // Cho phép cập nhật mật khẩu mới và sinh verifyToken mới để gửi lại email xác thực
      const newVerifyToken = uuidv4()
      const newPasswordHash = await bcrypt.hash(reqBody.password, 10)
      userToProcess = await userModel.update(existUser._id, {
        password: newPasswordHash,
        verifyToken: newVerifyToken
      })
    } else {
      // tạo data lưu vào DB
      const nameFromEmail = reqBody.email.split('@')[0]
      const newUser = {
        email: reqBody.email,
        // 8: số vòng lặp băm, càng nhiều vòng lặp thì càng an toàn nhưng sẽ tốn thời gian hơn
        password: await bcrypt.hash(reqBody.password, 10),
        username: nameFromEmail,
        displayName: nameFromEmail,
        verifyToken: uuidv4()
      }

      // lưu vào DB
      const createdUser = await userModel.createNew(newUser)
      userToProcess = await userModel.findOneById(createdUser.insertedId)
    }

    // gửi email xác thực cho user
    const verifiCationLink = `${WEBSITE_DOMAINS}/account/verification?email=${userToProcess.email}&token=${userToProcess.verifyToken}`

    // In link xác thực ra console server (Render Logs) để tiện kích hoạt ngay
    logger.info(`[VERIFICATION LINK] for ${userToProcess.email}: ${verifiCationLink}`)

    const customSubject = 'Verify your email address - Trello'
    const recipientName = userToProcess.displayName || userToProcess.username || userToProcess.email.split('@')[0]
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email address</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #172b4d;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f5f7; padding: 40px 15px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 16px rgba(9, 30, 66, 0.08); overflow: hidden; border: 1px solid #ebecf0;">
                <!-- Header / Logo -->
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #0052cc 0%, #0c66e4 100%); padding: 32px 20px;">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); padding: 8px 16px; border-radius: 6px;">
                            <span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Trello</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Content Body -->
                <tr>
                  <td style="padding: 36px 32px 24px 32px;">
                    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #172b4d;">
                      Verify your email address 🎉
                    </h2>
                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #42526e;">
                      Hi <strong>${recipientName}</strong>,
                    </p>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #42526e;">
                      Thank you for signing up for Trello! To finish setting up your account and get started with your boards, please verify that <strong>${userToProcess.email}</strong> belongs to you.
                    </p>

                    <!-- CTA Button -->
                    <table border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 10px 0;">
                      <tr>
                        <td align="center" style="border-radius: 6px;" bgcolor="#0052cc">
                          <a href="${verifiCationLink}" target="_self" style="font-size: 15px; font-family: inherit; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; display: inline-block; font-weight: 600; letter-spacing: 0.2px;">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding: 0 32px;">
                    <div style="border-top: 1px solid #ebecf0;"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td align="center" style="padding: 24px 32px; background-color: #fafbfc;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #8993a4;">
                      This message was sent from Trello Workspace.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #8993a4;">
                      © ${new Date().getFullYear()} Trello. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    // gọi tới provider gửi email
    try {
      await brevoProvider.sendEmail(userToProcess.email, customSubject, htmlContent)
    } catch (emailError) {
      logger.error('Brevo sendEmail failed:', emailError?.response?.body || emailError?.message || emailError)
      // Không để lỗi 401 của Brevo tràn ra làm API trả 401 (gây logout ở FE)
      throw new ApiError(
        StatusCodes.BAD_GATEWAY,
        'Account created, but failed to send verification email (Brevo error). Check server logs for the verification link or verify your Brevo credentials.'
      )
    }

    // trả về phía controller
    return pickUser(userToProcess)
  } catch (error) { throw error }
}

const verifyAccount = async (reqBody) => {
  try {
    // Query user trong Database
    const existUser = await userModel.findOneByEmail(reqBody.email)

    // Các bước kiểm tra cần thiết
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Account not found!')
    // Nếu tài khoản đã được kích hoạt từ trước (ví dụ do click lại link hoặc trình duyệt pre-fetch), coi như thành công
    if (existUser.isActive) return pickUser(existUser)
    if (existUser.verifyToken !== reqBody.token) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Invalid token!')

    // mọi thứ ok cập nhật lại thông tin user trong DB
    const updateData = {
      isActive: true,
      verifyToken: null
    }
    const updatedUser = await userModel.update(existUser._id, updateData)
    return pickUser(updatedUser)
  } catch (error) { throw error }
}

const login = async (reqBody) => {
  try {
    // Query user trong Database
    const existUser = await userModel.findOneByEmail(reqBody.email)

    // Các bước kiểm tra cần thiết
    // Anti-enumeration: email khong ton tai va sai mat khau tra cung status + message
    if (!existUser) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Your email or password is incorrect!')
    if (!existUser.isActive) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Your account is not active')
    if (!(await bcrypt.compare(reqBody.password, existUser.password))) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Your email or password is incorrect!')
    }

    // Nếu mọi thứ ok thì bắt đầu tạo Tokens đăng nhập để trả về cho phía FE
    // (refreshToken được lưu bản ghi vào DB để rotate/thu hồi)
    const { accessToken, refreshToken } = await issueTokenPair(existUser)

    // Trả về thông tin của user kèm theo 2 cái token vừa tạo ra
    return { ...pickUser(existUser), accessToken, refreshToken }
  } catch (error) { throw error }
}

const refreshToken = async (clientRefreshToken) => {
  // Verify / giải mã cái refresh token xem có hợp lệ không (chữ ký + hạn dùng JWT)
  const refreshTokenDecoded = await jwtProvider.verifyToken(clientRefreshToken, env.REFRESH_TOKEN_SECRET_SIGNATURE)

  // Tra cứu bản ghi trong DB: token phải do hệ thống cấp và CHƯA bị thu hồi
  const storedToken = await refreshTokenModel.findByTokenHash(clientRefreshToken)
  if (!storedToken || storedToken.revokedAt) {
    // Token đã bị thu hồi mà vẫn được dùng => dấu hiệu bị đánh cắp (kẻ trộm và chủ token
    // cùng dùng 1 token cũ) => thu hồi TOÀN BỘ refresh token của user để ép đăng nhập lại
    if (storedToken && storedToken.revokedAt) {
      await refreshTokenModel.revokeAllByUserId(storedToken.userId)
    }
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Session expired, please sign in again!')
  }

  // Kiểm tra xem user có thực sự còn tồn tại trong DB và chưa bị xóa / khóa tài khoản
  const existUser = await userModel.findOneById(refreshTokenDecoded._id)
  if (!existUser || existUser._destroy || !existUser.isActive) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Account not found or has been deactivated!')
  }

  // ROTATION: cấp cặp token mới rồi thu hồi token cũ trong 1 transaction (atomic)
  // Token cũ bị đánh dấu revoked kèm replacedByHash => mỗi refresh token chỉ dùng được 1 lần
  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(existUser)
  await withTransaction(async (session) => {
    await refreshTokenModel.revokeByTokenHash(clientRefreshToken, newRefreshToken, { session })
  })

  return { accessToken, refreshToken: newRefreshToken }
}

const update = async (userId, reqBody, userAvatarFile) => {
  try {
    // Query User và kiểm tra cho chắc chắn
    const existUser = await userModel.findOneById(userId)
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Account not found!')
    if (!existUser.isActive) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Your account is not active!')

    // Khởi tạo kết quả updated User ban đầu là empty
    let updatedUser = {}

    // Trường hợp change password
    if (reqBody.current_password && reqBody.new_password) {
      // Kiểm tra current_password có đúng không
      if (!(await bcrypt.compare(reqBody.current_password, existUser.password))) {
        throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Your current password is incorrect!')
      }
      // Nếu đúng thì tiến hành update password mới
      updatedUser = await userModel.update(existUser._id, { password: await bcrypt.hash(reqBody.new_password, 10) })
      // Đổi mật khẩu => thu hồi toàn bộ refresh token đang có, ép mọi phiên đăng nhập khác phải đăng nhập lại
      await refreshTokenModel.revokeAllByUserId(existUser._id)
    } else if (userAvatarFile) {
      // upload avatar file on cloudinary
      const uploadResult = await cloudinaryProvider.streamUpload(userAvatarFile.buffer, 'trello-users')

      // save avatar url to database
      updatedUser = await userModel.update(existUser._id, { avatar: uploadResult.secure_url })
    } else {
      // Trường hợp update thông tin chung chung (whitelist chỉ cho phép displayName)
      const updateData = {}
      if (reqBody.displayName) updateData.displayName = reqBody.displayName
      updatedUser = await userModel.update(existUser._id, updateData)
    }
    return pickUser(updatedUser)
  } catch (error) { throw error }
}

const googleLogin = async (reqBody) => {
  try {
    const { token } = reqBody

    // Verify Google ID token
    let googlePayload = null
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: env.GOOGLE_CLIENT_ID
      })
      googlePayload = ticket.getPayload()
    } catch (_err) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid Google token!')
    }

    if (!googlePayload || !googlePayload.email || !googlePayload.email_verified) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Google account is unverified or invalid!')
    }

    const { email, name, picture } = googlePayload

    // Tìm kiếm xem user đã tồn tại trong DB chưa
    let existUser = await userModel.findOneByEmail(email)

    if (existUser) {
      // Nếu user đã tồn tại nhưng đã bị xóa / khóa tài khoản
      if (existUser._destroy) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'Your account has been deleted!')
      }

      // Nếu user chưa active hoặc chưa có avatar, cập nhật từ thông tin Google
      const updateData = {}
      if (!existUser.isActive) updateData.isActive = true
      if (!existUser.avatar && picture) updateData.avatar = picture
      if (Object.keys(updateData).length > 0) {
        existUser = await userModel.update(existUser._id, updateData)
      }
    } else {
      // Nếu user chưa tồn tại, tự động tạo mới tài khoản với isActive = true
      const username = email.split('@')[0]
      const newUser = {
        email,
        password: await bcrypt.hash(uuidv4(), 10), // Mật khẩu ngẫu nhiên an toàn cho tài khoản OAuth
        username,
        displayName: name || username,
        avatar: picture || null,
        role: 'client',
        isActive: true
      }
      const createdUser = await userModel.createNew(newUser)
      existUser = await userModel.findOneById(createdUser.insertedId)
    }

    // Tạo cặp token accessToken và refreshToken (có lưu bản ghi để rotate/thu hồi)
    const { accessToken, refreshToken } = await issueTokenPair(existUser)

    return { ...pickUser(existUser), accessToken, refreshToken }
  } catch (error) { throw error }
}

/**
 * Đăng xuất: thu hồi refresh token hiện tại (nếu có) để nó không thể refresh nữa.
 * Không throw - logout luôn thành công từ góc nhìn client.
 */
const logout = async (clientRefreshToken) => {
  try {
    if (clientRefreshToken) {
      await refreshTokenModel.revokeByTokenHash(clientRefreshToken)
    }
    return { loggedOut: true }
  } catch (error) {
    return { loggedOut: true }
  }
}

/**
 * Yêu cầu đặt lại mật khẩu: sinh reset token (hạn 15 phút) và gửi email hướng dẫn.
 * Chống email enumeration: dù email có tồn tại hay không, response luôn giống nhau.
 */
const forgotPassword = async (reqBody) => {
  const GENERIC_MESSAGE = 'If that email address is in our database, we have sent a password reset link to it.'
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (!existUser || existUser._destroy || !existUser.isActive) {
      return { message: GENERIC_MESSAGE }
    }

    // Sinh token reset (uuid) và lưu kèm hạn dùng 15 phút
    const resetToken = uuidv4()
    await userModel.update(existUser._id, {
      resetPasswordToken: resetToken,
      resetPasswordExpire: Date.now() + ms('15m')
    })

    const resetLink = `${WEBSITE_DOMAINS}/reset-password?email=${encodeURIComponent(existUser.email)}&token=${resetToken}`

    logger.info(`[PASSWORD RESET LINK] for ${existUser.email}: ${resetLink}`)

    const customSubject = 'Reset your password - Trello'
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Reset your password</title></head>
      <body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #172b4d;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f5f7; padding: 40px 15px;">
          <tr><td align="center">
            <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #ebecf0;">
              <tr>
                <td align="center" style="background: linear-gradient(135deg, #0052cc 0%, #0c66e4 100%); padding: 32px 20px;">
                  <span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Trello</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 36px 32px 24px 32px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700;">Reset your password 🔑</h2>
                  <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #42526e;">
                    Hi <strong>${existUser.displayName || existUser.username || existUser.email.split('@')[0]}</strong>,
                  </p>
                  <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #42526e;">
                    We received a request to reset the password for your account (<strong>${existUser.email}</strong>).
                    Click the button below to choose a new password. This link is valid for <strong>15 minutes</strong>.
                  </p>
                  <table border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 10px 0;">
                    <tr>
                      <td align="center" style="border-radius: 6px;" bgcolor="#0052cc">
                        <a href="${resetLink}" target="_self" style="font-size: 15px; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; display: inline-block; font-weight: 600;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin: 16px 0 0 0; font-size: 13px; color: #8993a4;">
                    If you did not request a password reset, you can safely ignore this email — your password will not change.
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 24px 32px; background-color: #fafbfc;">
                  <p style="margin: 0; font-size: 12px; color: #8993a4;">
                    © ${new Date().getFullYear()} Trello. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `

    try {
      await brevoProvider.sendEmail(existUser.email, customSubject, htmlContent)
    } catch (emailError) {
      logger.error('Brevo sendEmail (password reset) failed:', emailError?.response?.body || emailError?.message || emailError)
      throw new ApiError(
        StatusCodes.BAD_GATEWAY,
        'Failed to send the password reset email. Please try again later.'
      )
    }

    return { message: GENERIC_MESSAGE }
  } catch (error) { throw error }
}

/**
 * Đặt lại mật khẩu bằng reset token: kiểm tra token + hạn dùng, cập nhật mật khẩu mới,
 * xóa token reset và THU HỒI TOÀN BỘ refresh token (mọi phiên đăng nhập khác bị đẩy ra).
 */
const resetPassword = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (!existUser || existUser._destroy) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Invalid or expired reset link!')
    }
    if (!existUser.resetPasswordToken || existUser.resetPasswordToken !== reqBody.token) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Invalid or expired reset link!')
    }
    if (!existUser.resetPasswordExpire || Date.now() > existUser.resetPasswordExpire) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'This reset link has expired. Please request a new one.')
    }

    const updatedUser = await userModel.update(existUser._id, {
      password: await bcrypt.hash(reqBody.newPassword, 10),
      resetPasswordToken: null,
      resetPasswordExpire: null
    })

    // Mật khẩu vừa thay đổi => mọi refresh token cũ đều vô hiệu, ép đăng nhập lại ở mọi thiết bị
    await refreshTokenModel.revokeAllByUserId(existUser._id)

    return pickUser(updatedUser)
  } catch (error) { throw error }
}

export const userService = {
  createNew,
  verifyAccount,
  login,
  googleLogin,
  refreshToken,
  update,
  logout,
  forgotPassword,
  resetPassword
}
