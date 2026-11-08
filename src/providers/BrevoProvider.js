// Brevo (tên mới của Sendinblue) - gọi thẳng REST API v3 bằng fetch của Node (>=18).
// Không dùng SDK @getbrevo/brevo vì bản cũ kéo theo package `request` đã ngừng bảo trì
// (nhiều lỗ hổng critical: form-data, qs, tough-cookie).
// Docs: https://developers.brevo.com/reference/sendtransacemail
import { env } from '~/config/environment'
import { logger } from '~/utils/logger'

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email'
const REQUEST_TIMEOUT_MS = 10000

const sendEmail = async (recipientEmail, customSubject, htmlContent) => {
  // EMAIL_MODE=mock: bỏ qua việc gửi email thật (dùng trong CI/tests để test
  // các flow chứa email mà không phụ thuộc nhà cung cấp)
  if (String(env.EMAIL_MODE) === 'mock') {
    logger.info(`[EMAIL MOCK] To: ${recipientEmail} | Subject: ${customSubject}`)
    return { mocked: true }
  }

  const apiKey = env.BREVO_API_KEY ? env.BREVO_API_KEY.trim() : ''

  if (!apiKey) {
    throw new Error('Missing BREVO_API_KEY: cấu hình API Key v3 (bắt đầu bằng "xkeysib-") trong .env để gửi email.')
  }

  // Cảnh báo trực tiếp nếu dev/user nhầm giữa SMTP Key (xsmtpsib-) và REST API Key (xkeysib-)
  if (apiKey.startsWith('xsmtpsib-')) {
    const errorMsg = 'Invalid Brevo Key Type: Bạn đang cấu hình khóa SMTP (bắt đầu bằng "xsmtpsib-"). Brevo REST API yêu cầu API Key v3 (bắt đầu bằng "xkeysib-"). Hãy vào Brevo Dashboard > SMTP & API > Tab "API Keys" để tạo khóa "xkeysib-".'
    logger.error('❌ ' + errorMsg)
    throw new Error(errorMsg)
  }

  const response = await fetch(BREVO_SEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: {
        email: env.ADMIN_EMAIL_ADDRESS ? env.ADMIN_EMAIL_ADDRESS.trim() : 'admin@trello.com',
        name: env.ADMIN_EMAIL_NAME ? env.ADMIN_EMAIL_NAME.trim() : 'Trello Admin'
      },
      // to là array để có thể gửi cho nhiều người cùng lúc
      to: [{ email: recipientEmail }],
      subject: customSubject,
      htmlContent
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`Brevo API error ${response.status}: ${body.message || body.code || response.statusText}`)
  }

  // { messageId: '<...@smtp-relay.mailin.fr>' }
  return body
}

export const brevoProvider = {
  sendEmail
}
