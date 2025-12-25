# Project Plan: Hyper-local Bounty App (React Native + Node.js)

## 项目概述
本项目旨在构建一个基于地理位置的众包互助平台。用户可以发布需求并附带赏金（如：在图书馆借充电器），周围用户接单并完成任务后获得赏金。
目标平台：iOS (App Store) & Android。

## 技术栈规范
- **Frontend:** React Native (Expo CLI 推荐, 方便快速调试与部署)
- **Backend:** Node.js (NestJS 或 Express), TypeScript
- **Database:** PostgreSQL (with PostGIS extension)
- **Caching/Geo:** Redis (for real-time geo-spatial queries)
- **Communication:** Socket.io (for real-time updates)
- **Infrastructure:** Docker

---

## Phase 1: 基础架构与环境搭建 (Infrastructure & Auth)

**目标：** 跑通前后端连接，实现用户注册登录，确保数据库与环境可用。

### Backend Task 1.1: 初始化后端项目
- [ ] Initialize a Node.js project (NestJS recommended for structure).
- [ ] Set up Docker Compose for PostgreSQL (enable PostGIS) and Redis.
- [ ] Configure TypeORM or Prisma to connect to the DB.
- [ ] **Verification:** Server starts successfully and connects to the database.

### Backend Task 1.2: 用户认证模块 (Auth)
- [ ] Design User Schema (id, phone/email, password_hash, name, avatar, rating).
- [ ] Implement JWT Authentication (Login, Register, Refresh Token).
- [ ] **Verification:** Can register a user via Postman and receive a JWT token.

### Frontend Task 1.3: 初始化 APP 与 登录页面
- [ ] Initialize React Native project using Expo.
- [ ] Setup Navigation (React Navigation).
- [ ] Create Login/Register screens.
- [ ] Integrate API client (Axios) to talk to Backend Auth endpoints.
- [ ] **Verification:** User can sign up and log in on the simulator; JWT is stored locally (SecureStore).

---

## Phase 2: 地理位置服务 (LBS Core) - **核心难点**

**目标：** 实现用户位置实时上传，并能查询“附近的人”。

### Backend Task 2.1: 位置存储与更新 API
- [ ] Implement WebSocket gateway (Socket.io) for real-time location updates.
- [ ] Create an endpoint/socket event to receive `(latitude, longitude)`.
- [ ] Logic: Update user position in Redis using `GEOADD`.
- [ ] **Verification:** Send coordinates via WebSocket tool; verify data exists in Redis.

### Backend Task 2.2: 附近用户查询 API
- [ ] Create API to query nearby users using Redis `GEORADIUS` or `GEOSEARCH`.
- [ ] Filter out offline users.
- [ ] **Verification:** Mock 5 users with different coordinates; verify API returns only those within 500m.

### Frontend Task 2.3: 地图集成与位置上报
- [ ] Integrate Map library (react-native-maps).
- [ ] Request Location Permissions (Foreground & Background if needed).
- [ ] Implement logic to send current location to Backend every X seconds.
- [ ] Display current user's pin on the map.
- [ ] **Verification:** Moving the simulator location updates the coordinates sent to the server.

---

## Phase 3: 订单生命周期 (Bounty Workflow)

**目标：** 完成从“发单”到“接单”再到“完结”的闭环。

### Backend Task 3.1: 订单管理 (CRUD)
- [ ] Design Order Schema (id, requester_id, helper_id, status, title, description, reward_amount, lat, lng, created_at).
- [ ] Status Enum: `PENDING`, `ACCEPTED`, `COMPLETED`, `CANCELLED`.
- [ ] Implement "Create Order" API.
- [ ] Implement "List Nearby Orders" API (PostGIS query distance < 1km).
- [ ] **Verification:** Can create an order and see it in the database.

### Frontend Task 3.2: 发单与首页列表
- [ ] Create "Post Request" Modal (Input: Title, Description, Bounty).
- [ ] Home Screen: Fetch and display markers/list of nearby orders on the map.
- [ ] **Verification:** Create an order on Phone A; Phone B sees the marker appear on the map.

### Backend Task 3.3: 接单逻辑 (Concurrency Handling)
- [ ] Implement "Accept Order" API.
- [ ] **Critical:** Use Database Transaction to ensure an order is not accepted by two people simultaneously (Optimistic Locking or `SELECT FOR UPDATE`).
- [ ] Notify the Requester via Socket.io when order is accepted.
- [ ] **Verification:** Simulate concurrent requests; only one succeeds.

### Frontend Task 3.4: 订单状态流转 UI
- [ ] Create Order Detail Screen.
- [ ] UI for "Accept Order" (for helper).
- [ ] UI for "Complete Order" (for requester).
- [ ] Real-time status updates (screen refreshes when status changes).

---

## Phase 4: 支付与积分系统 (Mock Payment First)

**目标：** 实现虚拟货币流转，确保交易逻辑正确。暂不接入真实 Stripe/支付宝，避免开发受阻。

### Backend Task 4.1: 钱包系统
- [ ] Add `balance` column to User table.
- [ ] Implement "Transfer" logic: Deduct from Requester -> Hold -> Add to Helper (minus platform fee).
- [ ] Ensure transaction atomicity.
- [ ] **Verification:** Check DB balances before and after a completed order.

### Frontend Task 4.2: 钱包 UI
- [ ] Create Wallet Screen (Show Balance, Transaction History).
- [ ] **Verification:** Completing an order updates the balance on the UI.

---

## Phase 5: 消息与通知 (Communication)

**目标：** 用户之间可以简单沟通。

### Backend Task 5.1: 简易聊天
- [ ] Implement 1-on-1 Chat via Socket.io (Room ID = Order ID).
- [ ] Persist messages to MongoDB or PostgreSQL (optional for MVP, can be transient).

### Frontend Task 5.2: 聊天界面
- [ ] Integrate chat UI (react-native-gifted-chat).
- [ ] Enter chat room automatically upon Order Acceptance.

---

## Phase 6: 部署与高可用准备 (Deployment)

**目标：** 准备上线环境。

### DevOps Task 6.1: Docker & Nginx
- [ ] Write `Dockerfile` for Node.js app.
- [ ] Configure Nginx as Reverse Proxy (Load Balancer).
- [ ] Set up PM2 for Node.js process management within the container.

### DevOps Task 6.2: CI/CD Pipeline (Optional)
- [ ] Set up GitHub Actions to run tests and build Docker images.

---

## 指导语 (Prompting Tips for Claude Code)

- **One Step at a Time:** Don't paste the whole plan at once. Start with "Phase 1, Task 1.1".
- **Code First:** Ask Claude to "Generate the project structure and code for Task 1.1".
- **Test First:** Ask Claude to "Write a test case to verify this feature" before moving to the next task.
