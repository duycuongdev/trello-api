/**
 * Helper dùng chung cho integration tests:
 * - Spawn server build (build/src/server.js) trên port test, chờ health OK
 * - Sinh JWT cho user có thật trong DB
 * - Tự chọn dữ liệu test động (board + owner + outsider) để không phụ thuộc DB cụ thể
 * Chạy: npm run build && npm run test:e2e
 * (Cần MONGODB_URI trong env - không có thì suite tự skip)
 */
const { spawn } = require('node:child_process')
const path = require('node:path')
const NM = path.join(__dirname, '..', '..', 'node_modules') + path.sep

// Load .env của dự án (tests chạy trực tiếp bằng node, không qua babel/dotenv của server)
require(NM + 'dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })

const TEST_PORT = process.env.TEST_API_PORT || 19640
const BASE = `http://localhost:${TEST_PORT}/v1`

let serverProcess = null

const hasDbConfig = Boolean(process.env.MONGODB_URI)

const startServer = async () => {
  if (!hasDbConfig) return
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', '..', 'build', 'src', 'server.js')], {
    env: { ...process.env, LOCAL_DEV_APP_PORT: String(TEST_PORT), LOCAL_DEV_APP_HOST: 'localhost', BUILD_MODE: 'dev' },
    stdio: 'ignore'
  })
  // chờ health OK (tối đa ~40s: connect Atlas + create indexes)
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE.replace('/v1', '')}/v1/health`)
      if (res.ok) return
    } catch { /* chưa lên thì thử lại */ }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('Test server failed to start within 40s')
}

const stopServer = () => {
  if (serverProcess) {
    // Windows: process.kill() thường không đủ - dùng taskkill /T để diệt cả cây tiến trình
    if (process.platform === 'win32') {
      try {
        const { spawnSync } = require('node:child_process')
        spawnSync('taskkill', ['/F', '/T', '/PID', String(serverProcess.pid)], { stdio: 'ignore' })
      } catch { /* best effort */ }
    } else {
      serverProcess.kill()
    }
    serverProcess = null
  }
}

const api = async (method, fullPath, body = {}, token, headers = {}) => {
  // Chữ ký cố định: api(method, path, body, token, headers)
  // (KHÔNG tự đoán options object - tránh xung đột khi body có field tên 'token')
  const upper = method.toUpperCase()
  const isEmptyBody = body === undefined || body === null ||
    (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)
  const bodyStr = (!isEmptyBody && upper !== 'GET' && upper !== 'HEAD') ? JSON.stringify(body) : undefined
  const res = await fetch(BASE + fullPath, {
    method: upper,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: bodyStr
  })
  let data = null
  try { data = await res.json() } catch { /* body rỗng */ }
  return { status: res.status, data }
}

const signToken = (payload, secretName, expiresIn = '15m') =>
  require(NM + 'jsonwebtoken').sign(payload, process.env[secretName], { expiresIn })

const hashPassword = (plain) => require(NM + 'bcryptjs').hashSync(plain, 10)

// Chọn 1 board active có owner + 1 user active KHÔNG thuộc board đó
const pickBoardAndOutsider = async () => {
  const { MongoClient, ObjectId } = require(NM + 'mongodb')
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  const db = client.db(process.env.DATABASE_NAME)
  try {
    const boards = await db.collection('boards').find({ _destroy: { $ne: true }, ownerIds: { $exists: true, $ne: [] } }).limit(20).toArray()
    for (const board of boards) {
      const memberIds = [...(board.ownerIds || []), ...(board.memberIds || [])].map(String)
      const outsider = await db.collection('users').findOne({
        _id: { $nin: memberIds.map(id => new ObjectId(id)) },
        isActive: true, _destroy: { $ne: true }
      })
      if (!outsider) continue
      const owner = await db.collection('users').findOne({ _id: new ObjectId(memberIds[0]), isActive: true, _destroy: { $ne: true } })
      if (!owner) continue
      return {
        board, owner, outsider,
        boardUserIds: memberIds,
        cleanup: async () => { await client.close() }
      }
    }
    return null
  } catch (e) {
    await client.close()
    throw e
  }
}

const getDb = async () => {
  const { MongoClient } = require(NM + 'mongodb')
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  return { client, db: client.db(process.env.DATABASE_NAME) }
}

module.exports = { TEST_PORT, BASE, hasDbConfig, startServer, stopServer, api, signToken, hashPassword, pickBoardAndOutsider, getDb, NM }
