/**
 * Integration test: Anti-enumeration trên login (email lạ = sai mật khẩu, cùng status + message)
 * Chạy: npm run build && npm run test:e2e
 */
const { test, describe, before, after } = require('node:test')
const { BASE, hasDbConfig, startServer, stopServer, api, hashPassword, getDb } = require('./helpers.js')

let uid = null
let email = null

const d = hasDbConfig ? describe : describe.skip
const _suite = d('Login anti-enumeration', () => {
  before(async () => {
    await startServer()
    const { client, db } = await getDb()
    await db.collection('users').deleteMany({ email: /^login-int-test-[0-9]+@example.com/ })
    email = `login-int-test-${Date.now()}@example.com`
    uid = (await db.collection('users').insertOne({
      email,
      password: hashPassword('Passw0rd!123'),
      username: 'loginint',
      displayName: 'Login Integration',
      role: 'client',
      isActive: true,
      verifyToken: null,
      createdAt: new Date(),
      updatedAt: null,
      _destroy: false
    })).insertedId
    await client.close()
  })
  after(async () => {
    if (uid) {
      const { client, db } = await getDb()
      await db.collection('refresh_tokens').deleteMany({ userId: uid })
      await db.collection('users').deleteOne({ _id: uid })
      await client.close()
    }
    stopServer()
  })

  test('login đúng mật khẩu -> 200 (bcrypt 10 rounds)', async () => {
    const res = await api('POST', '/users/login', { email, password: 'Passw0rd!123' })
    assertEquals(res.status, 200, 'valid login')
    assertTrue(!!res.data.accessToken, 'accessToken present')
  })

  test('sai mật khẩu = email không tồn tại (cùng status + message)', async () => {
    const wrong = await api('POST', '/users/login', { email, password: 'WrongPass123!' })
    const missing = await api('POST', '/users/login', { email: 'ghost-xyz@example.com', password: 'WrongPass123!' })
    assertEquals(wrong.status, missing.status, 'same status')
    assertEquals(wrong.data.message, missing.data.message, 'same message')
  })
})

function assertEquals(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAILED: ${label} - expected ${expected}, got ${actual}`)
}
function assertTrue(cond, label) {
  if (!cond) throw new Error('FAILED: ' + label)
}
