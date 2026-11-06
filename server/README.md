# AIFlow Server · Express 后端

AIFlow 平台的 Express 后端：RESTful API + MCP Streamable HTTP + JWT 认证（含 SSO 与 MFA）+ 审批引擎 + Webhook 分发。

English: see [root README.md](../README.md).

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 主入口，全量 RESTful 路由 + MFA 路由 + 静态托管 |
| `src/db.js` | JSON 文件数据层（`find` 只接受函数谓词），可替换 SQLite/PG |
| `src/rbac.js` | 权限点、角色、组织架构种子数据 |
| `src/auth.js` | JWT 签发校验 + OAuth2/OIDC/CAS/企微/钉钉适配器（读配置中心） |
| `src/config.js` | 配置中心：19 项 schema、.env 播种（`cfg:` 前缀）、DB 优先读取 |
| `src/mfa.js` | 零依赖 MFA：TOTP（RFC 6238）、Passkey（CBOR/COSE/ASN.1 WebAuthn）、挑战会话 |
| `src/engine.js` | 审批流引擎：条件求值、会签/或签、部门主管逐级上报 |
| `src/webhook.js` | 16 事件分发、HMAC-SHA256 签名推送、失败重试 |
| `src/ai.js` | OpenAI 兼容生成表单/流程（读配置中心），离线模板兜底 |
| `src/mcp.js` | MCP Streamable HTTP（同端口 `/mcp`），13 tools |

## 运行

```bash
npm install
npm run dev      # node --watch src/index.js（端口 8790）
npm start        # 生产
```

## 主要接口

- `POST /api/auth/login` — 登录；启用 MFA 时返回 `{ mfaRequired, mfaToken }`
- `POST /api/auth/mfa/verify` — 二步验证换 JWT
- `GET/PUT /api/platform-config` — 配置中心读写（secret 掩码）
- `GET /api/me/mfa` · `POST /api/me/mfa/otp/setup|confirm` · `POST /api/me/mfa/passkey/options|register` · `DELETE /api/me/mfa/:credId` — MFA 自助管理
- `PATCH /api/users/:id` · `PATCH /api/roles/:id` — `mfaPolicy`（auto/none/otp/passkey）
- 其余：表单/流程/实例/任务/用户/角色/部门/Webhook 全量 CRUD
- `POST /mcp` — MCP Streamable HTTP
