#!/bin/bash

# Vancine Model Testing Script
# 测试所有可用模型并记录结果

API_URL="https://api.vancine.com"
API_KEY=""  # 需要填入有效的 API Key

echo "=========================================="
echo "Vancine 模型可用性测试"
echo "=========================================="
echo ""

# 检查 API Key
if [ -z "$API_KEY" ]; then
    echo "❌ 请在脚本中设置 API_KEY"
    exit 1
fi

# 测试结果文件
RESULT_FILE="model_test_results_$(date +%Y%m%d_%H%M%S).md"

echo "# Vancine 模型测试结果" > "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "测试时间：$(date)" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "## 测试结果汇总" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"
echo "| 模型 | 类型 | 状态 | 延迟 | 备注 |" >> "$RESULT_FILE"
echo "|------|------|------|------|------|" >> "$RESULT_FILE"

# 测试函数
test_model() {
    local model=$1
    local type=$2
    local endpoint=$3
    local payload=$4

    echo -n "测试 $model ($type)... "

    start_time=$(python3 -c 'import time; print(time.time())')

    response=$(curl -s -w "\n%{http_code}" \
        -X POST "$API_URL$endpoint" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "$payload" \
        --max-time 30 2>&1)

    end_time=$(python3 -c 'import time; print(time.time())')
    latency=$(python3 -c "print(f'{$end_time - $start_time:.2f}')")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        echo "✅ 成功 (${latency}s)"
        echo "| $model | $type | ✅ 成功 | ${latency}s | - |" >> "$RESULT_FILE"
    else
        error=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('message','未知错误'))" 2>/dev/null || echo "请求失败")
        echo "❌ 失败: $error"
        echo "| $model | $type | ❌ 失败 | ${latency}s | $error |" >> "$RESULT_FILE"
    fi
}

echo ""
echo "## 1. 文本模型测试"
echo ""

# DeepSeek 模型
test_model "deepseek-v4-flash" "文本" "/v1/chat/completions" '{
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "Hello, say hi in one word."}],
    "max_tokens": 10
}'

test_model "deepseek-v4-pro" "文本" "/v1/chat/completions" '{
    "model": "deepseek-v4-pro",
    "messages": [{"role": "user", "content": "Hello, say hi in one word."}],
    "max_tokens": 10
}'

# Doubao 文本模型
test_model "Doubao-Seed-2.0-pro" "文本" "/v1/chat/completions" '{
    "model": "Doubao-Seed-2.0-pro",
    "messages": [{"role": "user", "content": "Hello, say hi in one word."}],
    "max_tokens": 10
}'

test_model "Doubao-Seed-2.0-lite" "文本" "/v1/chat/completions" '{
    "model": "Doubao-Seed-2.0-lite",
    "messages": [{"role": "user", "content": "Hello, say hi in one word."}],
    "max_tokens": 10
}'

test_model "Doubao-Seed-2.0-mini" "文本" "/v1/chat/completions" '{
    "model": "Doubao-Seed-2.0-mini",
    "messages": [{"role": "user", "content": "Hello, say hi in one word."}],
    "max_tokens": 10
}'

echo ""
echo "## 2. 图片模型测试"
echo ""

test_model "Doubao-Seedream-4.0" "图片" "/v1/images/generations" '{
    "model": "Doubao-Seedream-4.0",
    "prompt": "A cute cat sitting on a windowsill",
    "n": 1,
    "size": "512x512"
}'

test_model "Doubao-Seedream-4.5" "图片" "/v1/images/generations" '{
    "model": "Doubao-Seedream-4.5",
    "prompt": "A cute cat sitting on a windowsill",
    "n": 1,
    "size": "512x512"
}'

test_model "Doubao-Seedream-5.0-lite" "图片" "/v1/images/generations" '{
    "model": "Doubao-Seedream-5.0-lite",
    "prompt": "A cute cat sitting on a windowsill",
    "n": 1,
    "size": "512x512"
}'

echo ""
echo "## 3. 视频模型测试"
echo ""

test_model "Doubao-Seedance-1.5-pro" "视频" "/v1/videos/generations" '{
    "model": "Doubao-Seedance-1.5-pro",
    "prompt": "A cat walking slowly",
    "duration": 5
}'

test_model "Doubao-Seedance-2.0" "视频" "/v1/videos/generations" '{
    "model": "Doubao-Seedance-2.0",
    "prompt": "A cat walking slowly",
    "duration": 5
}'

echo ""
echo "## 4. 3D 模型测试"
echo ""

test_model "Doubao-Seed3D-2.0" "3D" "/v1/3d/generations" '{
    "model": "Doubao-Seed3D-2.0",
    "prompt": "A simple cube"
}'

test_model "Hyper3D-Gen2" "3D" "/v1/3d/generations" '{
    "model": "Hyper3D-Gen2",
    "prompt": "A simple cube"
}'

test_model "Hitem3D-2.0" "3D" "/v1/3d/generations" '{
    "model": "Hitem3D-2.0",
    "prompt": "A simple cube"
}'

echo ""
echo "## 5. 音频模型测试"
echo ""

test_model "Doubao-tts" "语音合成" "/v1/audio/speech" '{
    "model": "Doubao-tts",
    "input": "Hello, this is a test.",
    "voice": "alloy"
}'

test_model "Doubao-tts2.0" "语音合成" "/v1/audio/speech" '{
    "model": "Doubao-tts2.0",
    "input": "Hello, this is a test.",
    "voice": "alloy"
}'

echo ""
echo "=========================================="
echo "测试完成！结果已保存到：$RESULT_FILE"
echo "=========================================="

# 显示结果文件
echo ""
cat "$RESULT_FILE"
