/**
 * Integration test: IDOR / Broken Access Control
 * Outsider KHÔNG được sửa/xóa board, column, card của người khác
 * Chạy: npm run build && npm run test:e2e
 */
const { test, describe, before, after } = require('node:test')
const { BASE, hasDbConfig, startServer, stopServer, api, signToken, pickBoardAndOutsider } = require('./helpers.js')

let ctx = null
let ownerToken = null
let outsiderToken = null

const d = hasDbConfig ? describe : describe.skip
const _suite = d('IDOR protection', () => {
  before(async () => {
    await startServer()
    ctx = await pickBoardAndOutsider()
    if (!ctx) throw new Error('No suitable board+outsider found in DB for testing')
    ownerToken = signToken({ _id: ctx.owner._id.toString(), email: ctx.owner.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE')
    outsiderToken = signToken({ _id: ctx.outsider._id.toString(), email: ctx.outsider.email }, 'ACCESS_TOKEN_SECRET_SIGNATURE')
  })
  after(async () => { stopServer(); if (ctx?.cleanup) await ctx.cleanup() })

  test('outsider PUT board -> 403', async () => {
    const res = await api('PUT', `/boards/${ctx.board._id}`, { description: ctx.board.description || 'x'.repeat(10) }, outsiderToken)
    assertEqual(res.status, 403, 'PUT board')
  })

  test('outsider DELETE board -> 403', async () => {
    const res = await api('DELETE', `/boards/${ctx.board._id}`, {}, outsiderToken)
    assertEqual(res.status, 403, 'DELETE board')
  })

  test('outsider GET board details -> 404 (không lộ sự tồn tại)', async () => {
    const res = await api('GET', `/boards/${ctx.board._id}`, {}, outsiderToken)
    assertEqual(res.status, 404, 'GET board details')
  })

  test('outsider POST column vào board người khác -> 403', async () => {
    const res = await api('POST', '/columns', { boardId: ctx.board._id.toString(), title: 'Hack Column' }, outsiderToken)
    assertEqual(res.status, 403, 'POST column')
  })

  test('outsider PUT card -> 403', async () => {
    // lấy 1 card thật của board
    const { MongoClient, ObjectId } = require('../../node_modules/mongodb')
    const client = new MongoClient(process.env.MONGODB_URI)
    await client.connect()
    const card = await client.db(process.env.DATABASE_NAME).collection('cards')
      .findOne({ boardId: new ObjectId(ctx.board._id), _destroy: { $ne: true } })
    await client.close()
    if (!card) return // board không có card thì bỏ qua case này
    const res = await api('PUT', `/cards/${card._id}`, { title: card.title }, outsiderToken)
    assertEqual(res.status, 403, 'PUT card')
  })

  test('owner vẫn thao tác bình thường (200)', async () => {
    const res = await api('PUT', `/boards/${ctx.board._id}`, { description: ctx.board.description || 'x'.repeat(10) }, ownerToken)
    assertEqual(res.status, 200, 'PUT board by owner')
  })
})

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAILED: ${label} - expected ${expected}, got ${actual}`)
}
