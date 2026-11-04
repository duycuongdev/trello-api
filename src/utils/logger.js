/* eslint-disable no-console */

/**
 * Logger gọn nhẹ (không thêm dependency): bọc console với timestamp + level.
 * - dev : có màu dễ đọc
 * - prod: giữ nguyên định dạng text để Render/Vercel logs thu thập được
 *
 * Quy ước dự án: KHÔNG dùng console.* trực tiếp trong src, dùng logger thay thế
 * (trừ file này và các trường hợp đặc biệt được eslint-disable rõ ràng).
 */

const timestamp = () => new Date().toISOString()

const isDev = process.env.BUILD_MODE !== 'production'

const COLORS = {
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  debug: '\x1b[90m', // gray
  reset: '\x1b[0m'
}

const write = (level, args) => {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`
  if (isDev) {
    const color = COLORS[level] || COLORS.reset
    console[level === 'debug' ? 'log' : level](`${color}${prefix}${COLORS.reset}`, ...args)
  } else {
    console[level === 'debug' ? 'log' : level](prefix, ...args)
  }
}

export const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => { if (isDev) write('debug', args) }
}
