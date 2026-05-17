└── supabase
    ├── functions
    │   ├── import_map.json         # 顶层导入映射
    │   ├── _shared                 # 共享代码模块
    │   │   ├── supabaseAdmin.ts   # Admin client (SECRET key)
    │   │   ├── supabaseClient.ts  # Public client (PUBLISHABLE key)
    │   │   ├── cors.ts            # CORS headers 封装
    │   │   ├── response.ts        # JSON 响应封装
    │   │   ├── feishu.ts          # 飞书 API 封装
    │   │   ├── auth.ts            # 用户认证封装
    │   │   └── utils.ts           # 工具函数 (decimal.js, dayjs)
    │   ├── feishu_login           # 飞书登录
    │   │   ├── index.ts
    │   │   ├── deno.json
    │   │   └── response.type.ts
    │   ├── api_categories         # 分类管理
    │   │   ├── index.ts
    │   │   └── deno.json
    │   ├── api_records            # 账单记录管理
    │   │   ├── index.ts
    │   │   └── deno.json
    │   ├── test_auth              # 认证测试
    │   │   ├── index.ts
    │   │   └── deno.json
    │   └── hello_world            # 示例函数
    │       ├── index.ts
    │       └── deno.json
    ├── tests                     # 测试目录
    │   ├── hello_world-test.ts
    │   ├── feishu_login-test.ts
    │   ├── api_categories-test.ts
    │   └── api_records-test.ts
    ├── migrations                # 数据库迁移
    └── config.toml              # Supabase CLI 配置
