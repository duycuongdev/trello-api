/**
 * Unit tests cho Joi validation middlewares (mock req/res/next, không cần DB).
 * Chạy: npm test (cần `npm run build` trước)
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { userValidation } = require('../build/src/validations/userValidation.js')
const { boardValidation } = require('../build/src/validations/boardValidation.js')

const mockRes = () => {
  const res = {}
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (data) => { res.body = data; return res }
  return res
}

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  const res = mockRes()
  let nextArg = null
  middleware(req, res, (arg) => { nextArg = arg; resolve({ nextArg, res }) })
})

describe('userValidation.createNew (đăng ký)', () => {
  test('email + password hợp lệ -> next() không tham số', async () => {
    const { nextArg } = await runMiddleware(userValidation.createNew, {
      body: { email: 'user@example.com', password: 'Passw0rd!' }
    })
    assert.equal(nextArg, undefined)
  })

  test('password yếu -> next(ApiError) với status 422', async () => {
    const { nextArg } = await runMiddleware(userValidation.createNew, {
      body: { email: 'user@example.com', password: 'short' }
    })
    assert.ok(nextArg, 'phải gọi next với lỗi')
    assert.equal(nextArg.statusCode, 422)
  })

  test('email sai định dạng -> 422', async () => {
    const { nextArg } = await runMiddleware(userValidation.createNew, {
      body: { email: 'not-an-email', password: 'Passw0rd!' }
    })
    assert.equal(nextArg.statusCode, 422)
  })
})

describe('userValidation.resetPassword', () => {
  test('đủ email + token + newPassword hợp lệ -> next()', async () => {
    const { nextArg } = await runMiddleware(userValidation.resetPassword, {
      body: { email: 'user@example.com', token: 'some-uuid-token', newPassword: 'NewPass456!' }
    })
    assert.equal(nextArg, undefined)
  })

  test('thiếu token -> 422', async () => {
    const { nextArg } = await runMiddleware(userValidation.resetPassword, {
      body: { email: 'user@example.com', newPassword: 'NewPass456!' }
    })
    assert.equal(nextArg.statusCode, 422)
  })
})

describe('boardValidation.createNew', () => {
  test('title + description hợp lệ -> next()', async () => {
    const { nextArg } = await runMiddleware(boardValidation.createNew, {
      body: { title: 'My Board', description: 'A board for testing' }
    })
    assert.equal(nextArg, undefined)
  })

  test('title quá ngắn -> 422', async () => {
    const { nextArg } = await runMiddleware(boardValidation.createNew, {
      body: { title: 'ab', description: 'A board for testing' }
    })
    assert.equal(nextArg.statusCode, 422)
  })
})

describe('boardValidation.moveCardToDifferentColumn', () => {
  const validBody = {
    currentCardId: '6a5d5c8ca9256eacdc52f2e4',
    prevColumnId: '6a5d5c8ca9256eacdc52f2e5',
    prevCardOrderIds: ['6a5d5c8ca9256eacdc52f2e6'],
    nextColumnId: '6a5d5c8ca9256eacdc52f2e7',
    nextCardOrderIds: ['6a5d5c8ca9256eacdc52f2e8', '6a5d5c8ca9256eacdc52f2e6']
  }

  test('payload hợp lệ -> next()', async () => {
    const { nextArg } = await runMiddleware(boardValidation.moveCardToDifferentColumn, { body: validBody })
    assert.equal(nextArg, undefined)
  })

  test('currentCardId sai định dạng ObjectId -> 422', async () => {
    const { nextArg } = await runMiddleware(boardValidation.moveCardToDifferentColumn, {
      body: { ...validBody, currentCardId: 'bad-id' }
    })
    assert.equal(nextArg.statusCode, 422)
  })
})
