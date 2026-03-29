# openclaw-cpp-channel 开发日记

## 项目背景

### 发起人
- **罗同学** - SOC 厂商底层开发
- 使用 Termux 在旧笔记本（华硕 X555LJ）上运行 OpenClaw

### 需求
在 Android 手机上运行 OpenClaw（交叉编译的 Node.js），需要通过 C++ Native 服务与 OpenClaw 双向通信。

### 技术方案
- **通信方式**: Unix Domain Socket（高性能、低延迟）
- **插件**: OpenClaw TypeScript 插件
- **客户端**: C++ 客户端库（支持 Android NDK 交叉编译）
- **验证平台**: Ubuntu（开发）+ Termux（手机实机）

---

## 调试环境

### 手机信息
- **设备**: Android 手机（Termux 环境）
- **IP**: `192.168.1.136`
- **端口**: `8022`
- **用户**: `u0_a259`
- **密码**: `qazwsx`
- **Socket 路径**: `/data/data/com.termux/files/home/openclaw.sock`

### SSH 连接方式
```bash
# 需要使用 sshpass 避免交互式输入
sshpass -p qazwsx ssh -o StrictHostKeyChecking=no u0_a259@192.168.1.136 -p 8022

# 查看日志
sshpass -p qazwsx ssh -o StrictHostKeyChecking=no u0_a259@192.168.1.136 -p 8022 "tail -50 /data/data/com.termux/files/home/logs/gateway.log"

# 查看系统日志
sshpass -p qazwsx ssh -o StrictHostKeyChecking=no u0_a259@192.168.1.136 -p 8022 "cat /data/data/com.termux/files/usr/tmp/openclaw-10259/openclaw-2026-03-29.log"
```

### Gateway 管理
```bash
# 重启 Gateway
sshpass -p qazwsx ssh ... "cd /proc && for p in [0-9]*; do [ -f \$p/comm ] && cat \$p/comm 2>/dev/null | grep -q openclaw && kill -9 \$p 2>/dev/null; done; rm -f /data/data/com.termux/files/home/openclaw.sock /data/data/com.termux/files/usr/tmp/openclaw-10259/gateway.*.lock; nohup node /data/data/com.termux/files/usr/lib/node_modules/openclaw/dist/index.js gateway --port 18790 </dev/null >/data/data/com.termux/files/home/logs/gateway.log 2>&1 &"
```

### 交叉编译
- **NDK 路径**: `$HOME/android-ndk-r27d/android-ndk-r27d`
- **工具链**: `$HOME/android-ndk-r27d/android-ndk-r27d/build/cmake/android.toolchain.cmake`
- **ABI**: `arm64-v8a`

```bash
# 编译 Android 版本
cd ~/.openclaw/workspace/openclaw-cpp-channel/client/build
rm -rf *
cmake .. -DBUILD_EXAMPLES=ON -DCMAKE_TOOLCHAIN_FILE=$HOME/android-ndk-r27d/android-ndk-r27d/build/cmake/android.toolchain.cmake -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-24
make -j4

# 传送到手机
sshpass -p qazwsx scp -o StrictHostKeyChecking=no -P 8022 ~/.openclaw/workspace/openclaw-cpp-channel/client/build/bin/chat u0_a259@192.168.1.136:/data/data/com.termux/files/home/chat
```

---

## 开发时间线

### 2026-03-28 - 项目初始化
- 创建 `openclaw-cpp-channel` 仓库
- 定义通信协议（JSON + 换行分隔）
- 初步规划 plugin 和 client 结构

### 2026-03-29 - 核心功能开发

#### 阶段 1: 连接调试
**问题**: C++ 客户端无法连接 Socket
**原因**: Gateway 没有正确启动，端口被占用
**解决**: 
1. 使用 `/proc` 遍历找到 `openclaw-gateway` 进程并 kill
2. 清理 lock 文件和 socket 文件
3. 重新启动 Gateway

**教训**: Termux 上的 `pgrep` 可能不工作，用 `/proc` 遍历更可靠

#### 阶段 2: API 认证
**问题**: HTTP 401 Unauthorized
**原因**: 插件没有正确传递 gateway token
**解决**:
1. 从 `openclaw.json` 的 `gateway.auth.token` 读取 token
2. 在 HTTP 请求的 Authorization header 中传递

#### 阶段 3: 流式输出
**问题**: AI 回复显示不完整，只显示 `<final`
**原因**: 解析 SSE 流时格式不对
**解决**:
1. 确保正确解析 `data: {...}` 格式
2. 支持多种格式: `parsed.choices[0].delta.content` 和 `parsed.delta.content`
3. 使用 `sendToCpp({ type: "chunk" })` 逐字发送

#### 阶段 4: 短期记忆
**问题**: 多轮对话没有上下文
**解决**:
1. 在插件中维护 `conversationHistory` Map
2. 每次请求带上前面的消息历史
3. 限制历史长度 20 条

#### 阶段 5: C++ 客户端更新
**问题**: 需要支持流式输出
**解决**:
1. 添加 `onChunk` 回调
2. 添加 `onDone` 回调
3. 使用 simple_json 替代手动解析

---

## 通信协议

### 消息格式（JSON + 换行分隔）

**C++ → OpenClaw:**
```json
{"type":"send","from":"android_user","text":"你好","id":1}
{"type":"ping"}
{"type":"clear","from":"android_user"}
```

**OpenClaw → C++:**
```json
{"type":"reply","to":"android_user","text":"回复内容"}
{"type":"chunk","to":"android_user","text":"逐字"}
{"type":"done","to":"android_user"}
{"type":"pong"}
{"type":"ack","id":1}
```

---

## 项目当前状态

### 已完成功能
- ✅ Unix Socket Server（插件）
- ✅ 消息收发
- ✅ 流式输出
- ✅ 短期记忆（20条）
- ✅ C++ 客户端（支持流式）
- ✅ NDK 交叉编译
- ✅ Termux 实机测试

### 待完善
- [ ] 长期记忆（向量数据库）
- [ ] 多用户支持
- [ ] session 管理
- [ ] 错误处理优化

---

## 关键文件路径

### 本地
```
~/.openclaw/workspace/openclaw-cpp-channel/
├── plugin/
│   └── index.ts              # OpenClaw 插件（部署到手机）
├── client/
│   ├── include/
│   │   ├── openclaw_client.h # C++ 客户端头文件
│   │   └── simple_json.h     # JSON 库
│   ├── src/
│   │   └── openclaw_client.cpp
│   └── CMakeLists.txt
└── examples/
    └── chat.cpp              # 聊天 demo
```

### 手机
```
/data/data/com.termux/files/home/
├── openclaw.sock            # Unix Socket
├── chat                     # 可执行文件
├── demo                     # 可执行文件
├── logs/
│   └── gateway.log          # Gateway 日志
└── .openclaw/
    ├── extensions/
    │   └── cpp-channel/
    │       └── index.ts      # 插件源码
    └── agents/main/agent/
        └── auth-profiles.json # API Key 存储
```

---

## 调试技巧

### 1. 查看 Gateway 日志
```bash
sshpass -p qazwsx ssh ... "tail -100 /data/data/com.termux/files/home/logs/gateway.log"
```

### 2. 清理并重启
```bash
# 一行搞定：kill、清理、重启
sshpass -p qazwsx ssh ... "cd /proc && for p in [0-9]*; do [ -f \$p/comm ] && cat \$p/comm 2>/dev/null | grep -q openclaw && kill -9 \$p 2>/dev/null; done; rm -f /data/data/com.termux/files/home/openclaw.sock /data/data/com.termux/files/usr/tmp/openclaw-10259/gateway.*.lock; nohup node /data/data/com.termux/files/usr/lib/node_modules/openclaw/dist/index.js gateway --port 18790 </dev/null >/data/data/com.termux/files/home/logs/gateway.log 2>&1 &"
```

### 3. 查看系统日志
```bash
sshpass -p qazwsx ssh ... "cat /data/data/com.termux/files/usr/tmp/openclaw-10259/openclaw-2026-03-29.log | grep -i 'Sending chunk\|你好'"
```

### 4. 测试 API
```bash
# 测试 /v1/chat/completions
sshpass -p qazwsx ssh ... "curl -s -X POST http://127.0.0.1:18790/v1/chat/completions -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_TOKEN' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"model\":\"openclaw\"}'"
```

---

## 下次维护提醒

1. **修改插件**: 改手机上的 `/data/data/com.termux/files/home/.openclaw/extensions/cpp-channel/index.ts`，然后重启 Gateway
2. **更新客户端**: 重新编译后用 scp 传到手机
3. **日志位置**: 手机上有两份日志，一个是 `logs/gateway.log`，一个是系统日志
4. **Socket 占用**: 如果连接失败，先检查 socket 是否被占用，kill 所有相关进程

---

_最后更新: 2026-03-29_