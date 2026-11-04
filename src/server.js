/* eslint-disable no-console */
import express from 'express'
import exitHook from 'async-exit-hook'
import { CONNECT_DB, CLOSE_DB } from '~/config/mongodb'
import { env } from '~/config/environment'
import { APIs_V1 } from '~/routes/v1'
import { errorHandlingMiddleware } from './middlewares/errorHandlingMiddleware'
import { rateLimiterMiddleware } from './middlewares/rateLimiterMiddleware'
import cors from 'cors'
import { corsOptions } from './config/cors'
import cookieParser from 'cookie-parser'
import socketIo from 'socket.io'
import http from 'http'
import { inviteUserToBoardSocket } from './sockets/inviteUserToBoardSocket'
import { boardSocket } from './sockets/boardSocket'
import { socketAuthMiddleware } from './sockets/socketAuthMiddleware'

const START_SERVER = () => {
  const app = express()

  // Ẩn thông tin framework ExpressJS để chống fingerprinting
  app.disable('x-powered-by')

  // Bật trust proxy để Express đọc đúng IP client khi chạy sau Render/Cloudflare reverse proxy
  app.set('trust proxy', 1)

  // Cấu hình HTTP Security Headers cơ bản (chống MIME sniffing, Clickjacking, XSS)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    next()
  })
  app.use(cookieParser())

  // Fix cái vụ Cache from disk của ExpressJS
  // https://stackoverflow.com/a/53240717/8324172
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use(cors(corsOptions))
  // enable req.body json data
  app.use(express.json())

  // Áp dụng apiLimiter cho toàn bộ router /v1
  app.use('/v1', rateLimiterMiddleware.apiLimiter, APIs_V1)

  // API trả về cho UptimeRobot để check health (tránh lỗi 404)
  app.get('/', (req, res) => {
    res.status(200).json({ message: 'API is running!' })
  })

  // midleware xử lý lỗi tập chung
  app.use(errorHandlingMiddleware)

  // create new server nested in express app
  const server = http.createServer(app)

  // create new socket.io server
  const io = new socketIo.Server(server, { cors: corsOptions })
  // Bắt buộc xác thực JWT ở bước handshake: connection không hợp lệ sẽ bị từ chối ngay
  io.use(socketAuthMiddleware)
  io.on('connection', (socket) => {
    inviteUserToBoardSocket(socket)
    boardSocket(socket, io)
  })

  if (env.BUILD_MODE === 'production') {
    const port = process.env.PORT || 8000
    server.listen(port, () => {
      console.log(`Production Hello ${env.AUTHOR}, Back-end sever is running successfully at Port ${port}`)
    })
  } else {
    server.listen(env.LOCAL_DEV_APP_PORT, env.LOCAL_DEV_APP_HOST, () => {
      console.log(`Local Dev Hello ${env.AUTHOR}, Back-end sever is running successfully at Host ${env.LOCAL_DEV_APP_HOST} and Port: ${env.LOCAL_DEV_APP_PORT}`)
    })
  }

  // thực hiện tác vụ cleanup trước khi dừng server lại
  exitHook(() => {
    console.log('disconnecting')
    CLOSE_DB()
    console.log('disconnected')

  })
}

// chỉ khi kết nối Database thành công mới start server backend lên
// immediately-invoked / anonymous async function (IIFF)
(async () => {
  try {
    console.log('Connecting to MongoDB Clould Atlas!')
    await CONNECT_DB()
    console.log('Connected to MongoDB Clould Atlas!')

    START_SERVER()
  } catch (error) {
    console.log(error)
    process.exit(0)
  }
})()
