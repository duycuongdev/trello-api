/**
 * Seed demo data cho tài khoản Guest (guest@duycuong.dev).
 *
 * Mục đích: tạo board có nội dung THẬT (To do / In Progress / Done, thẻ như
 * "Implement login API with JWT rotation") thay vì dữ liệu test "board 03",
 * cột "Hana"/"Cường", thẻ "three" — để nhà tuyển dụng dùng thử có cảm giác
 * sản phẩm thật, và để chụp ảnh demo cho portfolio/CV.
 *
 * Cách chạy:
 *   node scripts/seed-demo-board.mjs            (mặc định backend local :1900)
 *   API_ROOT=https://... node scripts/seed-demo-board.mjs   (backend production)
 *
 * Script idempotent: nếu đã có board "Website Redesign — Launch Plan" thuộc
 * guest thì bỏ qua (không nhân đôi dữ liệu). Dùng --force để tạo lại.
 */

const API_ROOT = process.env.API_ROOT || 'http://localhost:1900'
const FORCE = process.argv.includes('--force')

const GUEST_EMAIL = 'guest@duycuong.dev'
const MAIN_BOARD_TITLE = 'Website Redesign — Launch Plan'

// Thời gianneo thực tế: hôm nay seed là 11/2026
const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const at = (offsetDays) => now + offsetDays * DAY

const results = { created: 0, skipped: 0, errors: [] }
const log = (...args) => console.log(...args)

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

async function guestLogin() {
  const res = await fetch(`${API_ROOT}/v1/users/guest_login`, { method: 'POST' })
  if (!res.ok) throw new Error(`guest_login failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  log(`API_ROOT = ${API_ROOT}`)

  // 1. Đăng nhập guest (tự tạo tài khoản nếu chưa có)
  const guest = await guestLogin()
  log(`Guest: ${guest.email} (${guest._id})`)
  const token = guest.accessToken
  const headers = { Authorization: `Bearer ${token}` }

  // 2. Kiểm tra board chính đã tồn tại chưa (idempotent)
  const boards = await api('/v1/boards?page=1&itemsPerPage=100', { token })
  const existing = boards.boards?.find((b) => b.title === MAIN_BOARD_TITLE)
  if (existing && !FORCE) {
    log(`Board "${MAIN_BOARD_TITLE}" đã tồn tại (${existing._id}) — bỏ qua seed. Dùng --force để tạo lại.`)
    return
  }
  if (existing && FORCE) {
    log(`Xóa board cũ ${existing._id} (--force)`)
    await api(`/v1/boards/${existing._id}`, { method: 'DELETE', token })
  }

  // 3. Tạo board chính
  const board = await api('/v1/boards', {
    method: 'POST',
    token,
    body: {
      title: MAIN_BOARD_TITLE,
      description: 'Team workspace to redesign and launch our marketing website. Tasks flow from API design to production deployment.'
    }
  })
  // Ảnh nền: dùng URL ảnh (UI hỗ trợ trực tiếp) — nếu fetch lỗi thì dùng màu phẳng
  try {
    const bgRes = await fetch('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=70', { method: 'HEAD' })
    if (bgRes.ok) {
      await api(`/v1/boards/${board._id}`, {
        method: 'PUT',
        token,
        body: { background: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=70' }
      })
    }
  } catch { /* giữ background mặc định */ }
  log(`Board created: ${board._id}`)

  // 4. Tạo 3 cột chuẩn workflow
  const columnTitles = ['To Do', 'In Progress', 'Done']
  const columns = []
  for (const title of columnTitles) {
    const col = await api('/v1/columns', { method: 'POST', token, body: { boardId: board._id, title } })
    columns.push(col)
    log(`Column created: ${title}`)
  }
  const [todo, inProgress, done] = columns

  // 5. Dữ liệu thẻ mẫu
  const LABEL = {
    backend: { title: 'Backend', color: '#61bd4f' },
    frontend: { title: 'Frontend', color: '#0079bf' },
    devops: { title: 'DevOps', color: '#c377e0' },
    design: { title: 'Design', color: '#ff78cb' },
    bug: { title: 'Bug', color: '#eb5a46' },
    docs: { title: 'Docs', color: '#a8e10c' },
    integration: { title: 'Integration', color: '#00c2e0' },
    research: { title: 'Research', color: '#f2d600' }
  }

  const todoCards = [
    {
      title: 'Add Brevo email notifications for deadlines',
      labels: [LABEL.integration],
      dueDate: at(14),
      description: '### Scope\n\nSend **reminder emails** through Brevo when a card deadline is approaching.\n\n- [ ] Cron job scanning due-soon cards\n- [ ] Brevo template + send logic\n- [ ] Unsubscribe link in footer',
      checklists: [{ title: 'Tasks', items: [{ title: 'Draft email template', isDone: false }, { title: 'Cron scanning job', isDone: false }] }]
    },
    {
      title: 'Write Swagger docs for all 41 endpoints',
      labels: [LABEL.docs],
      dueDate: at(17),
      description: 'Document every REST endpoint in `/v1/docs` (OpenAPI 3.0) — request schemas, auth, and error responses.',
      checklists: [{ title: 'Modules', items: [{ title: 'Boards & columns', isDone: false }, { title: 'Cards & comments', isDone: false }, { title: 'Users & invitations', isDone: false }] }]
    },
    {
      title: 'Configure Vercel + Render production deploy',
      labels: [LABEL.devops],
      dueDate: at(21),
      description: 'Frontend on **Vercel**, API on **Render** (free tier). Set env vars, health-check path `/v1/health`, and CORS origins.'
    },
    {
      title: 'Migrate card covers to Cloudinary CDN',
      labels: [LABEL.backend],
      dueDate: at(24),
      description: 'Stream uploads through Multer → Cloudinary, store `secure_url` on the card document.'
    },
    {
      title: 'Usability test with 5 teammates',
      labels: [LABEL.research],
      dueDate: at(29),
      description: 'Run 15-minute moderated sessions, record friction points, and turn findings into backlog cards.'
    }
  ]

  const inProgressCards = [
    {
      title: 'Implement login API with JWT rotation',
      labels: [LABEL.backend],
      dueDate: at(3),
      description: '### Goal\n\nReplace the legacy session auth with **JWT + refresh token rotation**.\n\n### Checklist rationale\n\nRotation must be atomic so a stolen refresh token cannot be replayed.\n\n```js\nconst accessToken = jwtProvider.generateToken(payload, secret, \'1h\')\n```',
      checklists: [{
        title: 'Auth tasks',
        items: [
          { title: 'Issue token pair on login', isDone: true },
          { title: 'Rotate refresh tokens atomically', isDone: false },
          { title: 'Add rate limiting on login endpoint', isDone: false }
        ]
      }],
      comments: [
        { content: 'Token rotation is working locally. Writing integration tests next.', userDisplayName: 'Guest', userAvatar: null },
        { content: 'Nice — remember to revoke all sessions on password change.', userDisplayName: 'Guest', userAvatar: null }
      ],
      member: true
    },
    {
      title: 'Build drag-and-drop Kanban board UI',
      labels: [LABEL.frontend],
      dueDate: at(9),
      cover: 'linear-gradient(135deg, #0c66e4 0%, #6554c0 55%, #00875a 100%)',
      description: 'Columns and cards reorder with **@dnd-kit**; state syncs through Redux Toolkit with optimistic updates.',
      checklists: [{
        title: 'UI tasks',
        items: [
          { title: 'Column drag-and-drop', isDone: true },
          { title: 'Card drag across columns', isDone: true },
          { title: 'Collision edge cases', isDone: false },
          { title: 'Touch device tuning', isDone: false },
          { title: 'Keyboard a11y mode', isDone: false }
        ]
      }],
      member: true
    },
    {
      title: 'Fix cross-browser cookie issues (Safari)',
      labels: [LABEL.bug],
      dueDate: at(-12), // quá hạn => demo badge OVERDUE
      description: 'Safari ITP blocks third-party cookies, so the HttpOnly cookie flow breaks on embeds.\n\n### Fix\n\nFall back to the **Bearer header** (Dual-Auth) when cookies are unavailable.',
      comments: [
        { content: 'Reproduced on Safari 17 with SameSite=None. Bearer fallback fixes it.', userDisplayName: 'Guest', userAvatar: null }
      ],
      member: true
    }
  ]

  const doneCards = [
    {
      title: 'Design database schema for boards & cards',
      labels: [LABEL.backend],
      dueDate: at(-22),
      isComplete: true,
      description: 'Normalised collections with ordered arrays for column/card position, plus aggregation pipelines for invitations and deadline alerts.',
      checklists: [{
        title: 'Schema review',
        items: [
          { title: 'Define users & auth collections', isDone: true },
          { title: 'Model boards, columns, cards', isDone: true },
          { title: 'Review indexes & query patterns', isDone: true }
        ]
      }],
      comments: [{ content: 'Schema approved by the team. Nice work! 🎉', userDisplayName: 'Guest', userAvatar: null }],
      member: true
    },
    {
      title: 'Set up CI pipeline with GitHub Actions',
      labels: [LABEL.devops],
      dueDate: at(-15),
      isComplete: true,
      description: 'Lint + unit/integration tests run on every push to `main`; deploys are blocked while red.',
      checklists: [{
        title: 'Pipeline',
        items: [
          { title: 'Lint stage', isDone: true },
          { title: 'Test stage (node --test)', isDone: true }
        ]
      }]
    },
    {
      title: 'Define brand color tokens & typography',
      labels: [LABEL.design],
      dueDate: at(-10),
      isComplete: true,
      cover: 'linear-gradient(135deg, #ff9f1a 0%, #eb5a46 50%, #c377e0 100%)',
      description: 'Design tokens for light/dark themes: primary blue `#0c66e4`, semantic colors, and the type scale.'
    }
  ]

  // 6. Tạo + cập nhật thẻ theo cột
  async function seedCard(column, spec) {
    const card = await api('/v1/cards', {
      method: 'POST',
      token,
      body: { boardId: board._id, columnId: column._id, title: spec.title }
    })

    const updateBody = {
      ...(spec.description !== undefined ? { description: spec.description } : {}),
      ...(spec.labels ? { labels: spec.labels } : {}),
      ...(spec.checklists ? { checklists: spec.checklists } : {}),
      ...(spec.cover ? { cover: spec.cover } : {}),
      ...(spec.dueDate ? { dueDate: spec.dueDate } : {}),
      ...(spec.isComplete ? { isDueDateComplete: true } : {})
    }
    if (Object.keys(updateBody).length > 0) {
      await api(`/v1/cards/${card._id}`, { method: 'PUT', token, body: updateBody })
    }

    for (const c of spec.comments || []) {
      await api(`/v1/cards/${card._id}`, { method: 'PUT', token, body: { commentToAdd: c } })
    }
    if (spec.member) {
      await api(`/v1/cards/${card._id}`, { method: 'PUT', token, body: { incomingMemberInfor: { userId: guest._id, action: 'ADD' } } })
    }
    log(`Card seeded: [${column.title}] ${spec.title}`)
  }

  for (const spec of todoCards) await seedCard(todo, spec)
  for (const spec of inProgressCards) await seedCard(inProgress, spec)
  for (const spec of doneCards) await seedCard(done, spec)

  // 7. Board phụ cho dashboard trông thật + board closed cho lifecycle
  const brainstorm = await api('/v1/boards', {
    method: 'POST',
    token,
    body: { title: 'Mobile App Brainstorm', description: 'Early exploration for a companion mobile app: ideas, research and quick capture.' }
  })
  await api(`/v1/boards/${brainstorm._id}`, { method: 'PUT', token, body: { background: '#0079bf' } })
  const ideasCol = await api('/v1/columns', { method: 'POST', token, body: { boardId: brainstorm._id, title: 'Ideas' } })
  const researchCol = await api('/v1/columns', { method: 'POST', token, body: { boardId: brainstorm._id, title: 'Researching' } })
  for (const t of ['Offline-first sync strategy', 'Widget for quick task capture', 'Push notification service']) {
    await api('/v1/cards', { method: 'POST', token, body: { boardId: brainstorm._id, columnId: ideasCol._id, title: t } })
  }
  await api('/v1/cards', { method: 'POST', token, body: { boardId: brainstorm._id, columnId: researchCol._id, title: 'User interviews — 5 participants' } })
  log('Second board seeded: Mobile App Brainstorm')

  const retro = await api('/v1/boards', {
    method: 'POST',
    token,
    body: { title: 'Sprint 23 — Retrospective', description: 'Retrospective notes for sprint 23. Closed after the action items were moved into the backlog.' }
  })
  const wellCol = await api('/v1/columns', { method: 'POST', token, body: { boardId: retro._id, title: 'What went well' } })
  await api('/v1/cards', { method: 'POST', token, body: { boardId: retro._id, columnId: wellCol._id, title: 'Real-time sync feels instant' } })
  await api(`/v1/boards/${retro._id}/close`, { method: 'PUT', token })
  log('Third board seeded & closed: Sprint 23 — Retrospective')

  log('\n✅ Seed hoàn tất. Đăng nhập bằng nút "Try as Guest" để xem dữ liệu.')
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
