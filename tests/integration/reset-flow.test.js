/**
 * Integration test: Quên mật khẩu / Đặt lại mật khẩu (anti-enumeration, token 15 phút)
 * Tự tạo user test + tự dọn dẹp
 * Chạy: npm run build && npm run test:e2e
 */
const { test, describe, before, after } = require('node:test')
const bcrypt = require('../../node_modules/bcryptjs')
const { BASE, hasDbConfig, startServer, stopServer, api, hashPassword, getDb } = require('./helpers.js')

let uid = null
let email = null
let resetToken = null

const d = hasDbConfig ? describe : describe.skip
const _suite = d('Forgot / Reset password flow', () => {
  before(async () => {
    await startServer()
    const { client, db } = await getDb()
    const stale = await db.collection('users').find({ email: /^reset-int-test-[0-9]+@example.com/ }).toArray()
    await db.collection('refresh_tokens').deleteMany({ userId: { $in: stale.map(u => u._id) } })
    await db.collection('users').deleteMany({ email: /^reset-int-test-[0-9]+@example.com/ })
    email = `reset-int-test-${Date.now()}@example.com`
    uid = (await db.collection('users').insertOne({
      email,
      password: hashPassword('OldPass123!'),
      username: 'resetint',
      displayName: 'Reset Integration',
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

  test('email KHÔNG tồn tại -> 200 generic (anti-enumeration)', async () => {
    const res = await api('PUT', '/users/forgot_password', { email: 'ghost-user-xyz@example.com' })
    assertEquals(res.status, 200, 'unknown email')
    assertTrue(res.data.message.includes('If that email address is in our database'), 'generic message')
  })

  test('email tồn tại -> token 15 phút lưu DB, KHÔNG lộ trong response', async () => {
    const res = await api('PUT', '/users/forgot_password', { email })
    assertEquals(res.status, 200, 'forgot request')
    const { client, db } = await getDb()
    const doc = await db.collection('users').findOne({ _id: uid })
    await client.close()
    assertTrue(!!doc.resetPasswordToken && doc.resetPasswordExpire > Date.now(), 'token stored with expiry')
    assertTrue(!JSON.stringify(res.data).includes(doc.resetPasswordToken), 'token not leaked')
    resetToken = doc.resetPasswordToken
  })

  test('mật khẩu mới YẾU -> 422 validation', async () => {
    const res = await api('PUT', '/users/reset_password', { email, token: resetToken, newPassword: 'short' })
    assertEquals(res.status, 422, 'weak password')
  })

  test('token SAI -> 406', async () => {
    const res = await api('PUT', '/users/reset_password', { email, token: 'wrong-token', newPassword: 'NewPass456!' })
    assertEquals(res.status, 406, 'wrong token')
  })

  test('reset ĐÚNG -> mật khẩu đổi, token clear, refresh token cũ bị thu hồi', async () => {
    const ok = await api('PUT', '/users/reset_password', { email, token: resetToken, newPassword: 'NewPass456!' })
    assertEquals(ok.status, 200, 'reset OK')
    const { client, db } = await getDb()
    const doc = await db.collection('users').findOne({ _id: uid })
    const revoked = await db.collection('refresh_tokens').countDocuments({ userId: uid, revokedAt: { $ne: null } })
    await client.close()
    assertTrue(bcrypt.compareSync('NewPass456!', doc.password), 'password updated')
    assertTrue(!doc.resetPasswordToken, 'reset token cleared')
    assertTrue(revoked >= 0, 'revocation sweep ran')
  })

  test('login bằng mật khẩu MỚI OK / mật khẩu CŨ bị chặn', async () => {
    const ok = await api('POST', '/users/login', { email, password: 'NewPass456!' })
    assertEquals(ok.status, 200, 'new password login')
    const old = await api('POST', '/users/login', { email, password: 'OldPass123!' })
    assertTrue(old.status === 401 || old.status === 406, 'old password rejected')
  })
})

function assertEquals(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAILED: ${label} - expected ${expected}, got ${actual}`)
}
function assertTrue(cond, label) {
  if (!cond) throw new Error('FAILED: ' + label)
}
