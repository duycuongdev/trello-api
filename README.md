# ⚙️ Trello API - Backend RESTful Services & Real-Time Socket Engine

[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native%20Driver-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Media%20Storage-3448C5?logo=cloudinary&logoColor=white)](https://cloudinary.com/)
[![Brevo](https://img.shields.io/badge/Brevo-Transactional%20Email-0092FF?logo=sendinblue&logoColor=white)](https://www.brevo.com/)
[![Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7?logo=render&logoColor=white)](https://trello-api-5hh5.onrender.com)

> Robust **Backend RESTful API** and **Real-Time WebSocket Engine** powering the Trello Clone platform. Provides a secure, scalable, and high-performance service architecture designed for seamless team collaboration.

---

## 🌐 Live Client & Application

- 🖥️ **Web Application**: [https://trello-web-tawny.vercel.app](https://trello-web-tawny.vercel.app)

---

## ⚡ Key Backend Modules

1. **Dual-Auth Authentication & Authorization**:
   - Automatically detects tokens from both **HttpOnly Cookies** (`accessToken`) and HTTP Request Headers (`Authorization: Bearer <token>`).
   - Implements **Refresh Token Rotation**: seamlessly issues new token pairs upon expiration, supporting custom `x-refresh-token` headers.
   - Eliminates third-party cookie blocking issues across iOS Safari / Mobile ITP.
   - Server-side verification of Google OAuth 2.0 tokens using `google-auth-library`.
2. **Real-Time Synchronization (Socket.IO)**:
   - Dynamic room management keyed by Board ID (`board:<boardId>`).
   - Broadcasts real-time events: column drag-and-drop, card movements, content updates, invitations, and deadline alerts.
3. **Board & Kanban Data Management**:
   - Hierarchical data architecture: **Board -> Columns -> Cards**.
   - Ordered array tracking (`columnOrderIds`, `cardOrderIds`).
   - Secure and optimized cross-column card drag transactions.
4. **Invitations & Deadline Reminders Aggregation**:
   - High-performance MongoDB Aggregation Pipeline combining:
     - Board collaboration invites (`BOARD_INVITATION`).
     - Approaching and overdue task deadlines assigned to the current user (`CARD_DEADLINE`).
5. **Media Storage & Transactional Communication**:
   - Direct attachments and card cover uploads to Cloudinary via Multer memory storage.
   - User account activation emails dispatched via Brevo RESTful Transactional Email API.

---

## 🛠 Backend Directory Architecture

```text
trello-api/
├── src/
│   ├── config/               # Environment (environment.js, cors.js, mongodb.js, cloudinary.js)
│   ├── controllers/          # HTTP request handlers
│   │   ├── boardController.js
│   │   ├── cardController.js
│   │   ├── columnController.js
│   │   ├── invitationController.js
│   │   └── userController.js
│   ├── middlewares/          # Auth middleware (Dual-auth), multer, error handler
│   ├── models/               # MongoDB Data Access Layer & Joi Schemas
│   ├── providers/            # Brevo Email Provider, Cloudinary Provider
│   ├── routes/v1/            # RESTful API v1 router definitions
│   ├── services/             # Core business logic services
│   ├── sockets/              # Socket.IO Event Handlers
│   ├── utils/                # Algorithms, formatters, JWT generators
│   ├── validations/          # Joi Request Validation Schemas
│   └── server.js             # Express Server & Socket.IO initialization
├── .env.example
├── package.json
└── README.md
```

---

## 🚀 Local Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment configuration
cp .env.example .env
```

Configuration in `.env`:
```env
LOCAL_DEV_APP_HOST=localhost
LOCAL_DEV_APP_PORT=8017

MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=trello-db

AUTHOR=Duy Cuong

BUILD_MODE=dev

WEBSITE_DOMAIN_DEVELOPMENT=http://localhost:5173
WEBSITE_DOMAIN_PRODUCTION=https://trello-web-tawny.vercel.app

BREVO_API_KEY=your_brevo_api_key
ADMIN_EMAIL_ADDRESS=your_email@example.com
ADMIN_EMAIL_NAME=Trello Admin

ACCESS_TOKEN_SECRET_SIGNATURE=your_access_token_secret
ACCESS_TOKEN_LIFE=1h
REFRESH_TOKEN_SECRET_SIGNATURE=your_refresh_token_secret
REFRESH_TOKEN_LIFE=14d

CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

Start the server:
```bash
# Run in development mode (Nodemon & Babel)
npm run dev

# Compile for production
npm run build

# Start production build
npm run start
```

Run tests (unit tests for utils & validation middlewares — requires `npm run build` first):
```bash
npm run build
npm test
```

API documentation (Swagger UI — served when the server is running):
```
GET /v1/docs        # Swagger UI
GET /v1/docs.json   # Raw OpenAPI 3.0 spec
GET /v1/health      # Health check (pings MongoDB, 503 when DB is down)
```

---

## 👨‍💻 Author

- **Nguyen Duy Cuong** (*duycuongdev*)
- **GitHub**: [@duycuongdev](https://github.com/duycuongdev)
