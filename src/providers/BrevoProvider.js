// Lưu ý Brevo là tên thương hiệu mới của sib – Sendinblue
// Vì thế trong phần hướng dẫn trên github có thể nó vẫn còn giữ tên biến SibApiV3Sdk
// https://github.com/getbrevo/brevo-node
const SibApiV3Sdk = require('@getbrevo/brevo')
import { env } from '~/config/environment'
import { logger } from '~/utils/logger'

/**
 * Có thể xem thêm phần docs cấu hình theo từng ngôn ngữ khác nhau tùy dự án ở Brevo Dashboard > Account > SMTP & API > API Keys
 * https://brevo.com
 * Với Nodejs thì tốt nhất cứ lên github repo của bọn nó là nhanh nhất:
 * https://github.com/getbrevo/brevo-node
 */
let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi()
let apiKey = apiInstance.authentications['apiKey']
if (env.BREVO_API_KEY) {
  apiKey.apiKey = env.BREVO_API_KEY.trim()
}

const sendEmail = async (recipientEmail, customSubject, htmlContent) => {
  const trimmedKey = env.BREVO_API_KEY ? env.BREVO_API_KEY.trim() : ''

  // Cảnh báo trực tiếp nếu dev/user nhầm giữa SMTP Key (xsmtpsib-) và REST API Key (xkeysib-)
  if (trimmedKey.startsWith('xsmtpsib-')) {
    const errorMsg = 'Invalid Brevo Key Type: Bạn đang cấu hình khóa SMTP (bắt đầu bằng "xsmtpsib-"). Thư viện Brevo REST API yêu cầu API Key v3 (bắt đầu bằng "xkeysib-"). Hãy vào Brevo Dashboard > SMTP & API > Tab "API Keys" để tạo khóa "xkeysib-".'
    logger.error('❌ ' + errorMsg)
    throw new Error(errorMsg)
  }

  // Đảm bảo apiKey luôn lấy giá trị mới nhất được trim khoảng trắng
  if (trimmedKey) {
    apiKey.apiKey = trimmedKey
  }

  // khởi tạo 1 cái sendSmtpEmail
  let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail()

  // tài khoản gửi email
  sendSmtpEmail.sender = {
    email: env.ADMIN_EMAIL_ADDRESS ? env.ADMIN_EMAIL_ADDRESS.trim() : 'admin@trello.com',
    name: env.ADMIN_EMAIL_NAME ? env.ADMIN_EMAIL_NAME.trim() : 'Trello Admin'
  }

  // người nhận email
  // to phải là 1 array để có thể gửi cho nhiều người cùng lúc
  sendSmtpEmail.to = [
    {
      email: recipientEmail
    }
  ]

  // chủ đề email
  sendSmtpEmail.subject = customSubject

  // nội dung email
  sendSmtpEmail.htmlContent = htmlContent

  // gửi email
  return apiInstance.sendTransacEmail(sendSmtpEmail)
}

export const brevoProvider = {
  sendEmail
}
