import express from 'express'
import { StatusCodes } from 'http-status-codes'
import { boardRouter } from './boardRoute'
import { columnRouter } from './columnRouter'
import { cardRouter } from './cardRouter'
import { userRoute } from './userRoute'
import { invitationRoute } from './invitationRoute'
import { GET_DB } from '~/config/mongodb'

const Router = express.Router()

// check api
Router.get('/status', (req, res) => {
  res.status(StatusCodes.OK).json({ message: 'APIs V1 are ready to use' })
})

/**
 * Health check cho monitoring (UptimeRobot, Render Health Check Path, ...)
 * - Ping thật xuống MongoDB để biết DB còn sống không (không chỉ "server còn chạy")
 * - 200 khi mọi thứ OK, 503 SERVICE_UNAVAILABLE khi DB chập chờn để monitoring cảnh báo
 */
Router.get('/health', async (req, res) => {
  const payload = {
    status: 'ok',
    db: 'up',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  }
  try {
    await GET_DB().command({ ping: 1 })
    res.status(StatusCodes.OK).json(payload)
  } catch (error) {
    res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
      ...payload,
      status: 'degraded',
      db: 'down',
      error: error?.message || 'database ping failed'
    })
  }
})

// boads api
Router.use('/boards', boardRouter )

// boads api
Router.use('/columns', columnRouter )

// boads api
Router.use('/cards', cardRouter )

// user api
Router.use('/users', userRoute )

// invitation api
Router.use('/invitations', invitationRoute )

export const APIs_V1 = Router
