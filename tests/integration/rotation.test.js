/**
 * Integration test: Refresh token rotation + theft detection + password change revocation
 * Tự tạo user test trong DB và tự dọn dẹp sau khi chạy xong
 * Chạy: npm run build && npm run test:e2e
 */
const { test, describe, before, after } = require('node:test')
const crypto = require('node:crypto')
const { BASE, hasDbConfig, startServer, stopServer, api, hashPassword, getDb } = require('./helpers.js')

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
let uid = null
let email = null

const d = hasDbConfig ? describe : describe.skip
const _suite = d('Refresh token rotation', () => {
  before(async () => {
    await startServer()
    // dọn user test từ các lần chạy trước + tạo user mới
    const { client, db } = await getDb()
    const stale = await db.collection('users').find({ email: /^rot-int-test-[0-9]+@example.com/ }).toArray()
    await db.collection('refresh_tokens').deleteMany({ userId: { $in: stale.map(u => u._id) } })
    await db.collection('users').deleteMany({ email: /^rot-int-test-[0-9]+@example.com/ })
    email = `rot-int-test-${Date.now()}@example.com`
    uid = (await db.collection('users').insertOne({
      email,
      password: hashPassword('TestPass123!'),
      username: 'rotinttest',
      displayName: 'Rotation Integration',
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

  test('login trả về cặp token + lưu bản ghi HASH vào DB', async () => {
    const res = await api('POST', '/users/login', { email, password: 'TestPass123!' })
    assertEquals(res.status, 200, 'login')
    assertTrue(!!res.data.refreshToken, 'refreshToken returned')
    const { client, db } = await getDb()
    const rec = await db.collection('refresh_tokens').findOne({ userId: uid, revokedAt: null })
    await client.close()
    assertTrue(!!rec && rec.tokenHash.length === 64, 'DB record stores 64-char hash')
    assertTrue(!JSON.stringify(rec).includes(res.data.refreshToken.slice(0, 20)), 'raw token NOT stored')
    global.__R1 = res.data.refreshToken
  })

  test('rotation: refresh cấp token MỚI + thu hồi token cũ kèm replacedBy', async () => {
    const rot = await api('GET', '/users/refresh_token', {}, global.__R1)
    assertEquals(rot.status, 200, 'refresh')
    assertTrue(rot.data.refreshToken && rot.data.refreshToken !== global.__R1, 'new refreshToken differs')
    const { client, db } = await getDb()
    const old = await db.collection('refresh_tokens').findOne({ tokenHash: sha256(global.__R1) })
    await client.close()
    assertTrue(old?.revokedAt !== null && old?.replacedByHash === sha256(rot.data.refreshToken), 'old revoked + replacedBy set')
    global.__R2 = rot.data.refreshToken
  })

  test('theft detection: dùng lại token đã thu hồi -> 401 + thu hồi TOÀN BỘ token của user', async () => {
    const reuse = await api('GET', '/users/refresh_token', {}, global.__R1)
    assertEquals(reuse.status, 401, 'reuse rejected')
    const { client, db } = await getDb()
    const r2 = await db.collection('refresh_tokens').findOne({ tokenHash: sha256(global.__R2) })
    await client.close()
    assertTrue(r2?.revokedAt !== null, 'all user tokens revoked')
  })

  test('đổi mật khẩu -> mọi refresh token bị thu hồi', async () => {
    const login = await api('POST', '/users/login', { email, password: 'TestPass123!' })
    assertEquals(login.status, 200, 're-login')
    const chg = await api('PUT', '/users/update',
      { current_password: 'TestPass123!', new_password: 'NewPass456!' },
      login.data.accessToken)
    assertEquals(chg.status, 200, 'password change')
    const after = await api('GET', '/users/refresh_token', {}, login.data.refreshToken)
    assertEquals(after.status, 401, 'old refresh token revoked after password change')
  })
})

function assertEquals(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAILED: ${label} - expected ${expected}, got ${actual}`)
}
function assertTrue(cond, label) {
  if (!cond) throw new Error('FAILED: ' + label)
}
