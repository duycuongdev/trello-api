import { env } from '../config/environment.js'

// những domain được phép truy cập tài nguyển của sever
export const WHITELIST_DOMAINS = [
  'http://localhost:5173',
  'https://trello-web-tawny.vercel.app'
]

export const WEBSITE_DOMAINS = (env.BUILD_MODE === 'dev') ? env.WEBSITE_DOMAIN_DEVELOPMENT : env.WEBSITE_DOMAIN_PRODUCTION

export const DEFAULT_PAGE = 1
export const DEFAULT_ITEMS_PER_PAGE = 12

export const INVITATION_TYPES = { BOARD_INVITATION: 'BOARD_INVITATION' }

export const BOARD_INVITATION_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
}

export const CARD_MEMBER_ACTION = {
  ADD: 'ADD',
  REMOVE: 'REMOVE'
}