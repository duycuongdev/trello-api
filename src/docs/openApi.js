/**
 * OpenAPI 3.0 specification cho Trello API.
 * Xem tại: GET /v1/docs (Swagger UI) | GET /v1/docs.json (raw JSON)
 *
 * Lưu ý giữ file này cập nhật khi thêm/sửa endpoint.
 */

const servers = []
if (process.env.WEBSITE_DOMAIN_PRODUCTION) servers.push({ url: process.env.WEBSITE_DOMAIN_PRODUCTION, description: 'Production (Render)' })
if (process.env.WEBSITE_DOMAIN_DEVELOPMENT) servers.push({ url: process.env.WEBSITE_DOMAIN_DEVELOPMENT, description: 'Development' })
if (servers.length === 0) servers.push({ url: 'http://localhost:8017', description: 'Local' })

const bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
const cookieAuth = { type: 'apiKey', in: 'cookie', name: 'accessToken' }

const idParam = (name = 'id', description = 'MongoDB ObjectId') => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
  description
})

const okResponse = (description, schemaRef) => ({
  description,
  content: { 'application/json': { schema: schemaRef } }
})
const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } }
})

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Trello Clone API',
    version: '1.0.0',
    description: [
      '**Kanban project management API** (MERN + Socket.IO real-time).',
      '',
      'Xác thực: **Dual-Auth** — JWT được gửi qua HttpOnly cookie (trình duyệt)',
      '*hoặc* header `Authorization: Bearer <accessToken>` (mobile/cross-origin).',
      'AccessToken ngắn hạn; khi hết hạn server trả **410 Gone**, client gọi',
      '`GET /v1/users/refresh_token` để lấy cặp token mới (rotation + revocation).'
    ].join('\n')
  },
  servers,
  tags: [
    { name: 'Health', description: 'Monitoring' },
    { name: 'Users', description: 'Đăng ký / đăng nhập / hồ sơ / mật khẩu' },
    { name: 'Boards', description: 'Board và thành viên' },
    { name: 'Columns', description: 'Column trong board' },
    { name: 'Cards', description: 'Card, comment, attachment, checklist' },
    { name: 'Invitations', description: 'Lời mời tham gia board' }
  ],
  components: {
    securitySchemes: { bearerAuth, cookieAuth },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 403 },
          message: { type: 'string', example: 'You do not have permission to access this board!' }
        }
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6a5d5c8ca9256eacdc52f2e4' },
          email: { type: 'string', format: 'email' },
          displayName: { type: 'string' },
          username: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['client', 'admin'] },
          isActive: { type: 'boolean' }
        }
      },
      Board: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string', example: 'Daily Work 11/2026' },
          description: { type: 'string' },
          slug: { type: 'string' },
          background: { type: 'string', nullable: true },
          ownerIds: { type: 'array', items: { type: 'string' } },
          memberIds: { type: 'array', items: { type: 'string' } },
          columnOrderIds: { type: 'array', items: { type: 'string' } },
          _destroy: { type: 'boolean' }
        }
      },
      Column: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          boardId: { type: 'string' },
          title: { type: 'string', example: 'To Do' },
          cardOrderIds: { type: 'array', items: { type: 'string' } }
        }
      },
      Card: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          boardId: { type: 'string' },
          columnId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          cover: { type: 'string', nullable: true },
          labels: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, color: { type: 'string' } } } },
          checklists: { type: 'array', items: { type: 'object' } },
          dueDate: { type: 'number', nullable: true, description: 'JS timestamp (ms)' },
          memberIds: { type: 'array', items: { type: 'string' } },
          comments: { type: 'array', items: { type: 'object' } },
          attachments: { type: 'array', items: { type: 'object' } }
        }
      },
      Invitation: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          inviterId: { type: 'string' },
          inviteeId: { type: 'string' },
          boardInvitation: {
            type: 'object',
            properties: { boardId: { type: 'string' }, status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] } }
          }
        }
      },
      BoardWithDetails: {
        allOf: [
          { $ref: '#/components/schemas/Board' },
          {
            type: 'object',
            properties: {
              columns: { type: 'array', items: { $ref: '#/components/schemas/Column' } },
              owners: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              members: { type: 'array', items: { $ref: '#/components/schemas/User' } }
            }
          }
        ]
      }
    }
  },
  paths: {
    '/v1/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check (ping DB thật)',
        security: [],
        responses: {
          200: { description: 'Mọi thứ OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, db: { type: 'string', example: 'up' }, uptime: { type: 'integer' } } } } } },
          503: { description: 'DB không phản hồi' }
        }
      }
    },

    '/v1/users/register': {
      post: {
        tags: ['Users'], summary: 'Đăng ký tài khoản (gửi email xác thực)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } } } } } },
        responses: { 201: okResponse('Đã tạo tài khoản, chờ verify', { $ref: '#/components/schemas/User' }), 409: errorResponse('Email đã tồn tại'), 422: errorResponse('Dữ liệu không hợp lệ'), 429: errorResponse('Quá 5 lần đăng ký/giờ/IP') }
      }
    },
    '/v1/users/verify': {
      put: {
        tags: ['Users'], summary: 'Xác thực email bằng token', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'token'], properties: { email: { type: 'string' }, token: { type: 'string' } } } } } },
        responses: { 200: okResponse('Đã kích hoạt', { $ref: '#/components/schemas/User' }), 404: errorResponse('Không tìm thấy tài khoản'), 406: errorResponse('Token không hợp lệ') }
      }
    },
    '/v1/users/login': {
      post: {
        tags: ['Users'], summary: 'Đăng nhập (set HttpOnly cookies + trả token)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
        responses: {
          200: okResponse('User + accessToken + refreshToken', { allOf: [{ $ref: '#/components/schemas/User' }, { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } } }] }),
          404: errorResponse('Tài khoản không tồn tại'), 406: errorResponse('Sai mật khẩu / chưa active'), 429: errorResponse('Quá 10 lần đăng nhập thất bại/15 phút')
        }
      }
    },
    '/v1/users/google-login': {
      post: {
        tags: ['Users'], summary: 'Đăng nhập bằng Google ID token', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', description: 'Google ID token từ @react-oauth/google' } } } } } },
        responses: { 200: okResponse('User + tokens', { $ref: '#/components/schemas/User' }), 401: errorResponse('Google token không hợp lệ') }
      }
    },
    '/v1/users/logout': {
      delete: {
        tags: ['Users'], summary: 'Đăng xuất (thu hồi refresh token + xóa cookie)', security: [],
        responses: { 200: okResponse('Đã đăng xuất', { type: 'object', properties: { loggedOut: { type: 'boolean' } } }) }
      }
    },
    '/v1/users/refresh_token': {
      get: {
        tags: ['Users'], summary: 'Làm mới accessToken (ROTATION: refreshToken cũ bị thu hồi)', security: [],
        parameters: [{ name: 'x-refresh-token', in: 'header', schema: { type: 'string' }, description: 'RefreshToken (hoặc dùng cookie refreshToken)' }],
        responses: {
          200: okResponse('Cặp token mới', { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } } }),
          401: errorResponse('Token hết hạn/thu hồi — nếu reuse token đã thu hồi, TOÀN BỘ token của user bị thu hồi (theft detection)')
        }
      }
    },
    '/v1/users/me': {
      get: {
        tags: ['Users'], summary: 'Hồ sơ user hiện tại',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: { 200: okResponse('User hiện tại', { $ref: '#/components/schemas/User' }), 401: errorResponse('Chưa đăng nhập') }
      }
    },
    '/v1/users/update': {
      put: {
        tags: ['Users'], summary: 'Cập nhật displayName / avatar / đổi mật khẩu',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { displayName: { type: 'string' }, avatar: { type: 'string', format: 'binary' }, current_password: { type: 'string' }, new_password: { type: 'string' } } } } } },
        responses: { 200: okResponse('User đã cập nhật', { $ref: '#/components/schemas/User' }), 406: errorResponse('Mật khẩu hiện tại sai') }
      }
    },
    '/v1/users/forgot_password': {
      put: {
        tags: ['Users'], summary: 'Gửi email đặt lại mật khẩu (luôn trả message chung — anti-enumeration)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } } } } },
        responses: { 200: okResponse('Message chung bất kể email tồn tại hay không', { type: 'object' }), 422: errorResponse('Email không hợp lệ'), 429: errorResponse('Quá 5 lần/giờ/IP') }
      }
    },
    '/v1/users/reset_password': {
      put: {
        tags: ['Users'], summary: 'Đặt lại mật khẩu bằng token trong email (thu hồi mọi phiên đăng nhập)', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'token', 'newPassword'], properties: { email: { type: 'string' }, token: { type: 'string' }, newPassword: { type: 'string' } } } } } },
        responses: { 200: okResponse('Đã đổi mật khẩu', { $ref: '#/components/schemas/User' }), 406: errorResponse('Token sai/hết hạn'), 422: errorResponse('Mật khẩu không đạt rule') }
      }
    },

    '/v1/boards': {
      get: {
        tags: ['Boards'], summary: 'Danh sách board của user (phân trang, tìm kiếm, lọc closed)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'itemsPerPage', in: 'query', schema: { type: 'integer', default: 8 } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Tìm theo title' },
          { name: 'closed', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }
        ],
        responses: { 200: okResponse('Danh sách board + tổng số', { type: 'object', properties: { boards: { type: 'array', items: { $ref: '#/components/schemas/Board' } }, totalBoards: { type: 'integer' } } }) }
      },
      post: {
        tags: ['Boards'], summary: 'Tạo board mới',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'description'], properties: { title: { type: 'string', minLength: 3, maxLength: 50 }, description: { type: 'string', minLength: 3, maxLength: 256 }, type: { type: 'string', enum: ['public', 'private'] }, background: { type: 'string' } } } } } },
        responses: { 201: okResponse('Board đã tạo', { $ref: '#/components/schemas/Board' }), 422: errorResponse('Dữ liệu không hợp lệ') }
      }
    },
    '/v1/boards/{id}': {
      get: {
        tags: ['Boards'], summary: 'Chi tiết board (columns + cards + members) — chỉ owner/member',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Board đầy đủ', { $ref: '#/components/schemas/BoardWithDetails' }), 403: errorResponse('Không thuộc board'), 404: errorResponse('Board không tồn tại') }
      },
      put: {
        tags: ['Boards'], summary: 'Cập nhật board (title/description/background — background có thể upload file)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, boardBackground: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: okResponse('Board đã cập nhật', { $ref: '#/components/schemas/Board' }), 403: errorResponse('Không có quyền') },
      },
      delete: {
        tags: ['Boards'], summary: 'XÓA VĨNH VIỄN board + toàn bộ columns/cards/invitations (atomic transaction)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã xóa', { type: 'object' }), 403: errorResponse('Chỉ board owner') }
      }
    },
    '/v1/boards/{id}/close': {
      put: {
        tags: ['Boards'], summary: 'Đóng board (soft close, có thể reopen)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã đóng', { type: 'object' }), 403: errorResponse('Chỉ board owner') }
      }
    },
    '/v1/boards/{id}/reopen': {
      put: {
        tags: ['Boards'], summary: 'Mở lại board đã đóng',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã mở lại', { type: 'object' }), 403: errorResponse('Chỉ board owner') }
      }
    },
    '/v1/boards/{id}/archived_items': {
      get: {
        tags: ['Boards'], summary: 'Danh sách columns/cards đã lưu trữ của board',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Archived cards + columns', { type: 'object' }), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/boards/supports/moving_card': {
      put: {
        tags: ['Boards'], summary: 'Di chuyển card sang column khác (3 ghi trong 1 transaction)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentCardId', 'prevCardOrderIds', 'nextCardOrderIds'], properties: { currentCardId: { type: 'string' }, prevColumnId: { type: 'string' }, prevCardOrderIds: { type: 'array', items: { type: 'string' } }, nextColumnId: { type: 'string' }, nextCardOrderIds: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { 200: okResponse('Di chuyển thành công', { type: 'object' }), 400: errorResponse('Column không thuộc board'), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/boards/{boardId}/members/{userId}': {
      delete: {
        tags: ['Boards'], summary: 'Xóa member khỏi board (owner) hoặc tự rời board (member)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam('boardId'), idParam('userId')],
        responses: { 200: okResponse('Đã xóa member', { type: 'object' }), 400: errorResponse('Không thể xóa owner'), 403: errorResponse('Không có quyền') }
      }
    },

    '/v1/columns': {
      post: {
        tags: ['Columns'], summary: 'Tạo column (atomic: insert + push vào board.columnOrderIds)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['boardId', 'title'], properties: { boardId: { type: 'string' }, title: { type: 'string', minLength: 3, maxLength: 50 } } } } } },
        responses: { 201: okResponse('Column đã tạo', { $ref: '#/components/schemas/Column' }), 403: errorResponse('Không có quyền trên board') }
      }
    },
    '/v1/columns/{id}': {
      put: {
        tags: ['Columns'], summary: 'Cập nhật column (title, cardOrderIds...)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, cardOrderIds: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { 200: okResponse('Column đã cập nhật', { $ref: '#/components/schemas/Column' }), 403: errorResponse('Không có quyền') }
      },
      delete: {
        tags: ['Columns'], summary: 'Xóa column + toàn bộ cards con (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã xóa', { type: 'object' }), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/columns/{id}/archive': {
      put: {
        tags: ['Columns'], summary: 'Lưu trữ column (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã lưu trữ', { $ref: '#/components/schemas/Column' }) }
      }
    },
    '/v1/columns/{id}/restore': {
      put: {
        tags: ['Columns'], summary: 'Khôi phục column đã lưu trữ (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã khôi phục', { $ref: '#/components/schemas/Column' }) }
      }
    },

    '/v1/cards': {
      post: {
        tags: ['Cards'], summary: 'Tạo card (atomic: insert + push vào column.cardOrderIds)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['boardId', 'columnId', 'title'], properties: { boardId: { type: 'string' }, columnId: { type: 'string' }, title: { type: 'string', minLength: 1, maxLength: 255 } } } } } },
        responses: { 201: okResponse('Card đã tạo', { $ref: '#/components/schemas/Card' }), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/cards/{id}': {
      put: {
        tags: ['Cards'], summary: 'Cập nhật card (title/description/labels/checklists/dueDate/members hoặc thêm comment qua commentToAdd; upload cover)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, cardCover: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: okResponse('Card đã cập nhật', { $ref: '#/components/schemas/Card' }), 403: errorResponse('Không có quyền') }
      },
      delete: {
        tags: ['Cards'], summary: 'Xóa vĩnh viễn card (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã xóa', { type: 'object' }), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/cards/{id}/comments/{commentId}': {
      put: {
        tags: ['Cards'], summary: 'Sửa comment (chỉ tác giả)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam(), idParam('commentId', 'ID của comment')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } } },
        responses: { 200: okResponse('Comment đã sửa', { $ref: '#/components/schemas/Card' }), 403: errorResponse('Chỉ tác giả được sửa') }
      },
      delete: {
        tags: ['Cards'], summary: 'Xóa comment (tác giả hoặc board owner)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam(), idParam('commentId', 'ID của comment')],
        responses: { 200: okResponse('Đã xóa', { $ref: '#/components/schemas/Card' }), 403: errorResponse('Không có quyền') }
      }
    },
    '/v1/cards/{id}/attachments': {
      post: {
        tags: ['Cards'], summary: 'Upload file đính kèm (Cloudinary)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'isChecklistOnly', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { attachment: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: okResponse('Card với attachment mới', { $ref: '#/components/schemas/Card' }) }
      }
    },
    '/v1/cards/{id}/attachments/{attachmentId}': {
      delete: {
        tags: ['Cards'], summary: 'Xóa file đính kèm',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam(), { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: okResponse('Đã xóa', { $ref: '#/components/schemas/Card' }) }
      }
    },
    '/v1/cards/{id}/copy': {
      post: {
        tags: ['Cards'], summary: 'Sao chép card sang column khác (giữ tùy chọn labels/checklists/...)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'columnId'], properties: { title: { type: 'string' }, columnId: { type: 'string' }, position: { type: 'integer' }, keepOptions: { type: 'object', properties: { labels: { type: 'boolean' }, checklists: { type: 'boolean' }, attachments: { type: 'boolean' }, members: { type: 'boolean' }, cover: { type: 'boolean' }, description: { type: 'boolean' }, dueDate: { type: 'boolean' } } } } } } } },
        responses: { 201: okResponse('Card bản sao', { $ref: '#/components/schemas/Card' }) }
      }
    },
    '/v1/cards/{id}/archive': {
      put: {
        tags: ['Cards'], summary: 'Lưu trữ card (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã lưu trữ', { $ref: '#/components/schemas/Card' }) }
      }
    },
    '/v1/cards/{id}/restore': {
      put: {
        tags: ['Cards'], summary: 'Khôi phục card từ kho lưu trữ (atomic)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam()],
        responses: { 200: okResponse('Đã khôi phục', { $ref: '#/components/schemas/Card' }), 400: errorResponse('Không còn column active nào') }
      }
    },

    '/v1/invitations': {
      get: {
        tags: ['Invitations'], summary: 'Thông báo của user: lời mời + cảnh báo deadline thẻ',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: { 200: okResponse('Danh sách thông báo', { type: 'array', items: { $ref: '#/components/schemas/Invitation' } }) }
      },
      post: {
        tags: ['Invitations'], summary: 'Gửi lời mời tham gia board qua email',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['inviteeEmail', 'boardId'], properties: { inviteeEmail: { type: 'string' }, boardId: { type: 'string' } } } } } },
        responses: { 201: okResponse('Lời mời đã tạo', { $ref: '#/components/schemas/Invitation' }), 400: errorResponse('Đã là thành viên / tự mời mình'), 429: errorResponse('Quá 30 lời mời/15 phút') }
      }
    },
    '/v1/invitations/{invitationId}': {
      put: {
        tags: ['Invitations'], summary: 'Chấp nhận / từ chối lời mời (chỉ invitee; accept = atomic push member)',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [idParam('invitationId')],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] } } } } } },
        responses: { 200: okResponse('Lời mời đã cập nhật', { $ref: '#/components/schemas/Invitation' }), 403: errorResponse('Chỉ invitee được thao tác') }
      }
    }
  }
}
