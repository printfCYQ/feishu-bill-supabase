# Supabase Edge Functions Hello World Demo

## 快速开始

### 1. 安装 Supabase CLI
```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# 验证安装
supabase --version
```

### 2. 初始化项目
```bash
mkdir my-supabase-app
cd my-supabase-app
supabase init
```

### 3. 创建第一个 Edge Function
```bash
supabase functions new hello-world
```

### 4. 编写代码
编辑 `supabase/functions/hello-world/index.ts`：

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

console.log('Hello World Edge Function 已启动!')

serve(async (req) => {
  const { name } = await req.json()
  
  return new Response(
    JSON.stringify({
      message: `Hello, ${name || 'World'}! 👋`,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### 5. 本地测试
```bash
supabase start
```

```bash
# 启动本地开发服务器
supabase functions serve hello-world --no-verify-jwt

# 测试接口
curl -X POST http://localhost:54321/functions/v1/hello-world \
  -H "Content-Type: application/json" \
  -d '{"name": "Supabase"}'
```

### 6. 部署到云端
```bash
# 登录
supabase login

# 关联项目
supabase link --project-ref <your-project-id>

# 部署函数∏
supabase functions deploy hello_world --no-verify-jwt

# 设置环境变量
supabase secrets set FEISHU_APP_TOKEN=xxxxxx
```


## API 接口列表

### Hello World
- **GET** `/functions/v1/hello-world` - 打招呼
- **POST** `/functions/v1/hello-world` - 个性化打招呼

## 测试输出示例

```bash
# 请求
curl -X POST http://localhost:54321/functions/v1/hello-world \
  -H "Content-Type: application/json" \
  -d '{"name": "Developer"}'

# 响应
{
  "message": "Hello, Developer! 👋",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "received": { "name": "Developer" }
}
```

## 部署脚本

运行 `bash supabase/deploy.sh` 一键部署所有函数。

## 测试脚本

运行 `bash supabase/test-api.sh` 测试所有接口。

---

🎉 **恭喜！** 你已经完成了 Supabase Edge Functions 的 Hello World Demo！