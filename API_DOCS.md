# 飞书记账工具 - Supabase Edge Functions API 文档

## 概述

本 API 基于 Supabase Edge Functions 实现，提供飞书多维表格的数据访问接口。支持飞书 OAuth 登录认证，仅允许指定用户访问。

---

## 基础信息

### API 端点

| 函数 | 端点 | 说明 |
|------|------|------|
| 飞书登录 | `https://<project>.supabase.co/functions/v1/feishu_login` | OAuth 登录 |
| 分类管理 | `https://<project>.supabase.co/functions/v1/api_categories` | 分类 CRUD |
| 账单记录 | `https://<project>.supabase.co/functions/v1/api_records` | 账单 CRUD |

### 认证方式

所有 API（除 `feishu_login` 外）需要在请求头中携带 Supabase Token：

```
Authorization: Bearer <access_token>
```

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | number | 0=成功，-1=失败 |
| message | string | 消息 |
| data | any | 数据 |

---

## 一、认证接口

### 1.1 飞书登录

**端点**: `GET /functions/v1/feishu_login?code=<code>`

**说明**: 用户通过飞书授权后，传入授权码获取 Supabase Token。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 飞书授权码 |

**返回**:

```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "email": "user@feishu.local",
    "user_metadata": {
      "feishu_uid": "ou_xxx",
      "name": "张三"
    }
  },
  "feishu_user": {
    "open_id": "ou_xxx",
    "name": "张三",
    "avatar_url": "https://..."
  }
}
```

**前端调用示例**:

```typescript
// 1. 跳转到飞书授权页面
const FEISHU_APP_ID = 'cli_xxx'
const REDIRECT_URI = encodeURIComponent('https://your-app.com/auth/callback')
window.location.href = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${FEISHU_APP_ID}&redirect_uri=${REDIRECT_URI}&state=random_state`

// 2. 授权回调后调用登录接口
const response = await fetch(
  `https://<project>.supabase.co/functions/v1/feishu_login?code=${code}`
)
const { access_token, user, feishu_user } = await response.json()

// 3. 保存 Token
localStorage.setItem('access_token', access_token)
```

---

## 二、分类管理接口

**端点**: `https://<project>.supabase.co/functions/v1/api_categories`

### 2.1 获取分类列表

**方法**: `GET`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 筛选类型（收入/支出） |
| user_id | string | 否 | 筛选用户（默认返回当前用户） |

**返回**:

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "record_id": "recvxxx",
      "id": "uuid-xxx",
      "name": "餐饮",
      "type": "支出",
      "icon": "🍜",
      "user_id": "ou_xxx"
    }
  ]
}
```

**示例**:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://<project>.supabase.co/functions/v1/api_categories?type=支出"
```

### 2.2 创建分类

**方法**: `POST`

**请求体**:

```json
{
  "name": "餐饮",
  "type": "支出",
  "icon": "🍜"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 分类名称 |
| type | string | 是 | 类型（收入/支出） |
| icon | string | 否 | 图标（默认空） |

**返回**:

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "record_id": "recvxxx",
    "id": "uuid-xxx",
    "name": "餐饮",
    "type": "支出",
    "icon": "🍜",
    "user_id": "ou_xxx"
  }
}
```

**示例**:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"餐饮","type":"支出","icon":"🍜"}' \
  "https://<project>.supabase.co/functions/v1/api_categories"
```

### 2.3 更新分类

**方法**: `PUT`

**请求体**:

```json
{
  "record_id": "recvxxx",
  "name": "餐饮（修改）",
  "icon": "🍽️"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | string | 是 | 分类的 record_id |
| name | string | 否 | 新名称 |
| type | string | 否 | 新类型 |
| icon | string | 否 | 新图标 |

**返回**:

```json
{
  "code": 0,
  "message": "更新成功"
}
```

### 2.4 删除分类

**方法**: `DELETE`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | string | 是 | 分类的 record_id |

**返回**:

```json
{
  "code": 0,
  "message": "删除成功"
}
```

**示例**:

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "https://<project>.supabase.co/functions/v1/api_categories?record_id=recvxxx"
```

---

## 三、账单记录接口

**端点**: `https://<project>.supabase.co/functions/v1/api_records`

### 3.1 获取账单列表

**方法**: `GET`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 筛选类型（income/expense） |
| user_id | string | 否 | 筛选用户（默认返回当前用户） |
| year | number | 否 | 年份（与 month 配合使用） |
| month | number | 否 | 月份（1-12） |
| start_date | string | 否 | 开始日期（YYYY-MM-DD） |
| end_date | string | 否 | 结束日期（YYYY-MM-DD） |
| category_id | string | 否 | 分类 ID |
| note | string | 否 | 备注关键词搜索 |
| amount_min | number | 否 | 最小金额 |
| amount_max | number | 否 | 最大金额 |

**返回**:

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "record_id": "recvxxx",
      "id": "uuid-xxx",
      "user_id": "ou_xxx",
      "amount": 35.5,
      "type": "expense",
      "category_id": "uuid-cat",
      "category_name": "餐饮",
      "note": "午餐",
      "created_at": 1746979200000
    }
  ]
}
```

> **注意**: `created_at` 为毫秒时间戳格式

### 3.2 获取单条记录

**方法**: `GET`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | string | 是 | 记录的 record_id |

**示例**:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://<project>.supabase.co/functions/v1/api_records?record_id=recvxxx"
```

### 3.3 获取月度统计

**方法**: `GET`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | 固定值 `summary` |
| year | number | 是 | 年份（如 2026） |
| month | number | 是 | 月份（1-12） |
| user_id | string | 否 | 筛选用户 |

**返回**:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "year": "2026",
    "month": "5",
    "total_income": 5000,
    "total_expense": 2000,
    "balance": 3000,
    "category_stats": {
      "餐饮": {"income": 0, "expense": 500},
      "工资": {"income": 5000, "expense": 0}
    }
  }
}
```

**示例**:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://<project>.supabase.co/functions/v1/api_records?action=summary&year=2026&month=5"
```

### 3.4 创建账单记录

**方法**: `POST`

**请求体**:

```json
{
  "amount": 35.5,
  "type": "expense",
  "category_id": "uuid-cat",
  "category_name": "餐饮",
  "note": "午餐",
  "created_at": 1746979200000
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| amount | number | 是 | 金额 |
| type | string | 是 | 类型（income/expense） |
| category_id | string | 是 | 分类的 id（UUID） |
| category_name | string | 是 | 分类名称 |
| note | string | 否 | 备注 |
| created_at | number | 否 | 创建时间（毫秒时间戳，默认当前时间） |

**返回**:

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "record_id": "recvxxx",
    "id": "uuid-xxx",
    "user_id": "ou_xxx",
    "amount": 35.5,
    "type": "expense",
    "category_id": "uuid-cat",
    "category_name": "餐饮",
    "note": "午餐",
    "created_at": 1746979200000
  }
}
```

**示例**:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":35.5,"type":"expense","category_id":"uuid-cat","category_name":"餐饮","note":"午餐"}' \
  "https://<project>.supabase.co/functions/v1/api_records"
```

### 3.5 更新账单记录

**方法**: `PUT`

**请求体**:

```json
{
  "record_id": "recvxxx",
  "amount": 50.0,
  "note": "晚餐",
  "created_at": 1747065600000
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | string | 是 | 记录的 record_id |
| amount | number | 否 | 新金额 |
| type | string | 否 | 新类型 |
| category_id | string | 否 | 新分类 id |
| category_name | string | 否 | 新分类名称 |
| note | string | 否 | 新备注 |
| created_at | number | 否 | 创建时间（毫秒时间戳） |

**返回**:

```json
{
  "code": 0,
  "message": "更新成功"
}
```

### 3.6 删除账单记录

**方法**: `DELETE`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| record_id | string | 是 | 记录的 record_id |

**返回**:

```json
{
  "code": 0,
  "message": "删除成功"
}
```

---

## 四、环境变量配置

在 Supabase Dashboard 中配置以下环境变量：

```env
# 飞书配置
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_APP_TOKEN=xxx
FEISHU_TABLE_RECORDS=tbl_xxx
FEISHU_TABLE_CATEGORIES=tbl_xxx
FEISHU_REDIRECT_URI=https://xxx.supabase.co/functions/v1/feishu_login

# Supabase 配置
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# 访问控制（可选，留空允许所有用户）
ALLOWED_OPEN_IDS=ou_xxx
```

---

## 五、前端调用示例

### 5.1 初始化 API 客户端

```typescript
const SUPABASE_URL = 'https://xxx.supabase.co'

// 获取存储的 Token
const getAuthHeader = () => {
  const token = localStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// API 请求封装
const api = {
  async get(endpoint: string, params?: Record<string, string | number>) {
    const url = new URL(`https://xxx.supabase.co/functions/v1/${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
    }
    const res = await fetch(url.toString(), { headers: getAuthHeader() })
    return res.json()
  },

  async post(endpoint: string, data: any) {
    const res = await fetch(`https://xxx.supabase.co/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    })
    return res.json()
  },

  async put(endpoint: string, data: any) {
    const res = await fetch(`https://xxx.supabase.co/functions/v1/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    })
    return res.json()
  },

  async delete(endpoint: string, params: Record<string, string>) {
    const url = new URL(`https://xxx.supabase.co/functions/v1/${endpoint}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: getAuthHeader()
    })
    return res.json()
  }
}
```

### 5.2 使用示例

```typescript
// 登录
async function login(code: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/feishu_login?code=${code}`)
  const data = await res.json()
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token)
  }
  return data
}

// 获取分类
async function getCategories(type?: string) {
  const params: any = {}
  if (type) params.type = type
  return api.get('api_categories', params)
}

// 获取账单（支持多种筛选条件）
async function getRecords(params?: { 
  type?: string; 
  year?: number; 
  month?: number;
  category_id?: string;
  note?: string;
  amount_min?: number;
  amount_max?: number;
}) {
  return api.get('api_records', params)
}

// 获取月度统计
async function getMonthlySummary(year: number, month: number) {
  return api.get('api_records', { action: 'summary', year, month })
}

// 创建账单
async function createRecord(data: {
  amount: number;
  type: 'income' | 'expense';
  category_id: string;
  category_name: string;
  note?: string;
  created_at?: number;
}) {
  return api.post('api_records', data)
}

// 创建分类
async function createCategory(data: {
  name: string;
  type: '收入' | '支出';
  icon?: string;
}) {
  return api.post('api_categories', data)
}
```

---

## 六、错误处理

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（Token 无效或过期） |
| 405 | 不支持的请求方法 |
| 500 | 服务器错误 |

**错误响应示例**:

```json
{
  "code": -1,
  "message": "未授权访问"
}
```

---

## 七、数据类型说明

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 账单类型：`income`（收入）或 `expense`（支出） |
| created_at | number | 毫秒时间戳 |
| amount | number | 金额（支持小数） |
| record_id | string | 飞书多维表格记录 ID（recv 开头） |
| id | string | 自定义 UUID |