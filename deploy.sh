#!/bin/bash
# Supabase Edge Functions 部署脚本

set -e

echo "=========================================="
echo "🚀 飞书记账工具 - Supabase Edge Functions 部署"
echo "=========================================="
echo ""

# 检查 supabase CLI 是否安装
if ! command -v supabase &> /dev/null; then
    echo "❌ 错误: 未找到 supabase CLI"
    echo "请先安装: npm install -g supabase"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env.local ]; then
    echo "⚠️  警告: 未找到 .env.local 文件"
    echo "请复制 .env.example 为 .env.local 并填入实际值"
    echo ""
fi

# 解析参数
FUNCTION=""
DEPLOY_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            DEPLOY_ALL=true
            shift
            ;;
        --function)
            FUNCTION="$2"
            shift 2
            ;;
        *)
            echo "未知参数: $1"
            echo "用法: ./deploy.sh [--all] [--function <函数名>]"
            exit 1
            ;;
    esac
done

# 部署指定函数
deploy_function() {
    local func_name=$1
    echo "📦 部署 $func_name..."
    supabase functions deploy "$func_name" --no-verify-jwt
    echo ""
}

# 根据参数决定部署哪些函数
if [ "$DEPLOY_ALL" = true ]; then
    echo "📦 部署所有函数..."
    deploy_function "feishu_login"
    deploy_function "api_categories"
    deploy_function "api_records"
elif [ -n "$FUNCTION" ]; then
    echo "📦 部署函数: $FUNCTION..."
    deploy_function "$FUNCTION"
else
    echo "请指定要部署的函数："
    echo "  --all              部署所有函数"
    echo "  --function <name>  部署指定函数"
    echo ""
    echo "可用函数："
    echo "  - feishu_login     飞书登录"
    echo "  - api_categories   分类管理"
    echo "  - api_records      账单记录"
    echo ""
    echo "示例："
    echo "  ./deploy.sh --all                      # 部署全部"
    echo "  ./deploy.sh --function api_records     # 只部署账单记录"
    exit 0
fi

echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "📋 已部署的函数:"
supabase functions list
echo ""
echo "📍 说明:"
echo "   --no-verify-jwt 表示由函数内部自行验证用户身份"
echo "   鉴权由 verifyUser() 函数处理，不依赖 Supabase JWT 自动验证"
