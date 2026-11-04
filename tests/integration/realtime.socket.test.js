/**
 * Integration test: Socket.IO auth + board room membership + member kick
 * Chạy: npm run build && npm run test:e2e
 */
const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { io } = require('socket.io-client')

const { BASE, hasDbConfig, startServer, stopServer, api, signToken, pickBoardAndOutsider, getDb, NM } = require('./helpers.js')

let ctx = null

const connect = (token) => new Promise((resolve) => {
  const opts = { transports: ['websocket', 'polling'], reconnection: false, timeout: 5000 }
  if (token !== undefined) opts.auth = { token }
  const s = io(`http://localhost:${process.env.TEST_API_PORT || 19640}`, opts)
  s.on('connect', () => resolve({ socket: s, error: null }))
  s.on('connect_error', (e) => resolve({ socket: s, error: e }))
  setTimeout(() => resolve({ socket: s, error: new Error('timeout') }), 6000)
})
const once = (socket, ev, ms = 2500) => new Promise((res) => {
  const timer = setTimeout(() => res(null), ms)
  socket.once(ev, (d) => { clearTimeout(timer); res(d) })
})

const d = hasDbConfig ? describe : describe.skip
const _suite = d('Socket.IO realtime security', () => {
  before(async () => { await startServer(); ctx = await pickBoardAndOutsider() })
  after(async () => { stopServer(); if (ctx?.cleanup) await ctx.cleanup() })

  test('connection bị từ chối khi thiếu/sai token', async () => {
    const bad = await connect('fake-token-xyz')
    check(bad.error, 'invalid token rejected')
    const none = await connect(undefined)
    check(none.error, 'no token rejected')
    bad.socket.disconnect(); none.socket.disconnect()
  })

  test('outsider không vào được phòng board (kể cả khi giả mạo user object)', async () => {
    const { socket } = await connect(signToken({ _id: ctx.outsider._id.toString(), email: ctx.outsider.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE'))
    const err = await once(socket, 'BE_BOARD_JOIN_ERROR')
    socket.emit('FE_USER_JOIN_BOARD_ROOM', { boardId: ctx.board._id.toString(), user: { _id: ctx.owner._id.toString(), displayName: 'FAKE' } })
    const err2 = await once(socket, 'BE_BOARD_JOIN_ERROR')
    check(err || err2, 'join rejected with BE_BOARD_JOIN_ERROR')
    socket.disconnect()
  })

  test('owner vào phòng OK + broadcast relay với identity thật từ server', async () => {
    const ownerToken = signToken({ _id: ctx.owner._id.toString(), email: ctx.owner.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE')
    const a1 = await connect(ownerToken)
    const a2 = await connect(ownerToken)
    a1.socket.emit('FE_USER_JOIN_BOARD_ROOM', { boardId: ctx.board._id.toString() })
    a2.socket.emit('FE_USER_JOIN_BOARD_ROOM', { boardId: ctx.board._id.toString() })
    const online = await once(a2.socket, 'BE_BOARD_USERS_ONLINE')
    check(Array.isArray(online) && online.some(u => u._id === ctx.owner._id.toString()), 'owner joined + online list ok')

    const recv = once(a2.socket, 'BE_BOARD_UPDATED')
    a1.socket.emit('FE_BOARD_UPDATED', { boardId: ctx.board._id.toString(), actionType: 'MOVE_COLUMN', payload: {}, senderId: 'fake', senderName: 'HACKER' })
    const data = await recv
    check(data && data.senderId === ctx.owner._id.toString() && data.senderName !== 'HACKER', 'sender identity forced server-side')
    a1.socket.disconnect(); a2.socket.disconnect()
  })

  test('KICK: member bị remove khỏi board -> socket bị đá khỏi phòng + nhận BE_BOARD_MEMBER_REMOVED', async () => {
    const db = await getDb()
    try {
      // Thêm outsider vào board làm member (test tự tạo scenario)
      await db.db.collection('boards').updateOne(
        { _id: ctx.board._id },
        { $addToSet: { memberIds: ctx.outsider._id } }
      )

      const outsiderToken = signToken({ _id: ctx.outsider._id.toString(), email: ctx.outsider.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE')
      const ownerToken = signToken({ _id: ctx.owner._id.toString(), email: ctx.owner.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE')

      const o = await connect(outsiderToken)
      o.socket.emit('FE_USER_JOIN_ROOM') // join phòng cá nhân (như FE thật) để nhận kick
      o.socket.emit('FE_USER_JOIN_BOARD_ROOM', { boardId: ctx.board._id.toString() })
      await once(o.socket, 'BE_BOARD_USERS_ONLINE')

      const kicked = once(o.socket, 'BE_BOARD_MEMBER_REMOVED', 5000)
      const owner = await connect(ownerToken)
      owner.socket.emit('FE_USER_JOIN_BOARD_ROOM', { boardId: ctx.board._id.toString() })
      await once(owner.socket, 'BE_BOARD_USERS_ONLINE')

      // Owner remove outsider qua API
      const res = await api('DELETE', `/boards/${ctx.board._id}/members/${ctx.outsider._id}`, {}, ownerToken)
      check(res.status === 200, 'remove member API OK', `got ${res.status}`)

      const kickedData = await kicked
      check(kickedData && kickedData.boardId === ctx.board._id.toString(), 'kicked user received BE_BOARD_MEMBER_REMOVED')

      // Sau kick: broadcast của outsider không còn tới phòng (broadcast blocked)
      let leaked = null
      owner.socket.on('BE_BOARD_UPDATED', (d) => { leaked = d })
      o.socket.emit('FE_BOARD_UPDATED', { boardId: ctx.board._id.toString(), actionType: 'HACK', payload: {} })
      await new Promise(r => setTimeout(r, 1200))
      check(leaked === null, 'kicked user can no longer broadcast')

      o.socket.disconnect(); owner.socket.disconnect()
    } finally {
      // dọn member thêm vào
      await db.db.collection('boards').updateOne(
        { _id: ctx.board._id },
        { $pull: { memberIds: ctx.outsider._id } }
      )
      await db.client.close()
    }
  })
})

// mini assert helper để log PASS/FAIL rồi ném lỗi cho node:test
function check(cond, name, detail = '') {
  if (!cond) throw new Error('FAILED: ' + name + (detail ? ' | ' + detail : ''))
}
