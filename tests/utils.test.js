/**
 * Unit tests cho các util thuần (không cần DB).
 * Import từ build/ (CommonJS output của babel) - chạy `npm run build` trước khi test.
 * Chạy: npm test
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { pagingSkipValue } = require('../build/src/utils/algorithms.js')
const { OBJECT_ID_RULE, EMAIL_RULE, PASSWORD_RULE } = require('../build/src/utils/validators.js')
const { slugify, pickUser } = require('../build/src/utils/formatter.js')
const { mapOrder } = require('../build/src/utils/sorts.js')

describe('pagingSkipValue (phân trang)', () => {
  test('trang 1 -> skip 0', () => {
    assert.equal(pagingSkipValue(1, 8), 0)
  })

  test('trang 3, 8 items/trang -> skip 16', () => {
    assert.equal(pagingSkipValue(3, 8), 16)
  })

  test('page/itemsPerPage thiếu hoặc <= 0 -> skip 0 (không crash)', () => {
    assert.equal(pagingSkipValue(undefined, 8), 0)
    assert.equal(pagingSkipValue(1, undefined), 0)
    assert.equal(pagingSkipValue(0, 8), 0)
    assert.equal(pagingSkipValue(1, -5), 0)
  })
})

describe('validators (regex rules)', () => {
  test('OBJECT_ID_RULE: chấp nhận ObjectId 24 hex, từ chối thứ khác', () => {
    assert.ok(OBJECT_ID_RULE.test('6a5d5c8ca9256eacdc52f2e4'))
    assert.ok(!OBJECT_ID_RULE.test('not-an-object-id'))
    assert.ok(!OBJECT_ID_RULE.test('6a5d5c8ca9256eacdc52f2e')) // 23 ký tự
    assert.ok(!OBJECT_ID_RULE.test(''))
  })

  test('EMAIL_RULE', () => {
    assert.ok(EMAIL_RULE.test('user@example.com'))
    assert.ok(!EMAIL_RULE.test('invalid-email'))
    assert.ok(!EMAIL_RULE.test('has space@example.com'))
  })

  test('PASSWORD_RULE: >= 8 ký tự, có chữ + số', () => {
    assert.ok(PASSWORD_RULE.test('Passw0rd!'))
    assert.ok(!PASSWORD_RULE.test('short'))        // quá ngắn
    assert.ok(!PASSWORD_RULE.test('onlyletters'))   // không có số
    assert.ok(!PASSWORD_RULE.test('12345678'))      // không có chữ
  })
})

describe('slugify', () => {
  test('chuyển title về slug chuẩn', () => {
    assert.equal(slugify('Daily Work 11/2026'), 'daily-work-112026')
    assert.equal(slugify('  Hello   World  '), 'hello-world')
    assert.equal(slugify('Tiếng Việt có dấu @#'), 'tieng-viet-co-dau')
  })

  test('giá trị rỗng/undefined -> chuỗi rỗng', () => {
    assert.equal(slugify(''), '')
    assert.equal(slugify(null), '')
  })
})

describe('pickUser (loại bỏ dữ liệu nhạy cảm)', () => {
  test('chỉ giữ các field an toàn, không lộ password/verifyToken', () => {
    const dbUser = {
      _id: 'u1',
      email: 'a@b.com',
      password: 'hashed-secret',
      verifyToken: 'token-secret',
      displayName: 'Tester',
      role: 'client',
      isActive: true
    }
    const safe = pickUser(dbUser)
    assert.equal(safe.displayName, 'Tester')
    assert.ok(!('password' in safe), 'không được chứa password')
    assert.ok(!('verifyToken' in safe), 'không được chứa verifyToken')
  })

  test('user null -> object rỗng (không crash)', () => {
    assert.deepEqual(pickUser(null), {})
  })
})

describe('mapOrder (sắp xếp theo mảng thứ tự)', () => {
  test('sắp xếp cards theo cardOrderIds', () => {
    const cards = [{ _id: 'c2' }, { _id: 'c1' }, { _id: 'c3' }]
    const order = ['c1', 'c2', 'c3']
    const ordered = mapOrder(cards, order, '_id')
    assert.deepEqual(ordered.map(c => c._id), ['c1', 'c2', 'c3'])
  })

  test('đầu vào thiếu -> mảng rỗng', () => {
    assert.deepEqual(mapOrder(null, ['a'], '_id'), [])
  })
})
