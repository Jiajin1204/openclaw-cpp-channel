# openclaw-cpp-channel

OpenClaw Channel 插件 - 通过 Unix Socket 与 C++ Native 服务双向通信

## 项目概述

本项目为 OpenClaw 开发一个 Channel 插件，通过 Unix Domain Socket 实现与 C++ Native 服务的双向消息通信。

### 背景

- **发起人**：罗同学（SOC 厂商底层开发）
- **目标平台**：Android 手机（交叉编译的 Node.js + OpenClaw）
- **验证平台**：Ubuntu（开发验证） + Termux（手机测试）✅

### 需求

1. **C++ → OpenClaw**：C++ Native 服务发送消息到 OpenClaw Agent 处理流程 ✅
2. **OpenClaw → C++**：Agent 回复通过 Socket 发回 C++ 服务 ✅
3. **双向通信**：消息注入 + 回复回传 ✅

## 技术方案

### 通信协议

```
Unix Domain Socket: /tmp/openclaw.sock (Ubuntu) 或 /data/data/com.termux/files/home/openclaw.sock (Android/Termux)

消息格式 (JSON + 换行分隔):
- C++ -> OpenClaw: {"type":"send","from":"user123","text":"你好","id":1}
- OpenClaw -> C++: {"type":"reply","to":"user123","text":"你好，我是 AI"}
- 心跳: {"type":"ping"} / {"type":"pong"}
- 确认: {"type":"ack","id":1}
```

### 架构

```
┌─────────────────┐        Unix Socket        ┌─────────────────┐
│   C++ Native    │ ◄──────────────────────► │   OpenClaw      │
│   Service       │    /tmp/openclaw.sock    │   Channel Plugin│
└─────────────────┘                          └─────────────────┘
       │                                              │
       │  sendMessage()                               │  HTTP /v1/chat/completions
       │  onMessage()                                 │  cpp_send tool
       ▼                                              ▼
    JSON 协议                                   OpenAI-compatible API
```

## 项目结构

```
openclaw-cpp-channel/
├── plugin/                    # OpenClaw 插件
│   ├── openclaw.plugin.json  # 插件清单
│   ├── index.ts              # 入口（已实现）
│   ├── package.json          # NPM 配置
│   └── src/                  # 源码（可扩展）
├── client/                   # C++ 客户端库
│   ├── include/
│   │   └── openclaw_client.h # 头文件
│   ├── src/
│   │   └── openclaw_client.cpp # 实现
│   ├── CMakeLists.txt        # 构建配置
│   └── build.sh              # 构建脚本
├── examples/                 # 示例
│   ├── demo.cpp              # 简单示例
│   └── chat.cpp              # 交互式聊天客户端
└── README.md                 # 使用说明
```

## 快速开始

### 1. 编译 C++ 客户端

```bash
cd client
mkdir -p build && cd build
cmake ..
make
```

### 2. 配置 OpenClaw

在 `openclaw.json` 中添加：

```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "your-gateway-token"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "cpp-channel": { "enabled": true }
    }
  }
}
```

### 3. 运行

1. 启动 OpenClaw Gateway
2. 运行 C++ 客户端：
   ```bash
   ./bin/chat
   ```

## 开发状态

### Phase 1: 插件开发（OpenClaw 侧）✅

- [x] 创建插件框架
- [x] 实现 Unix Socket Server
- [x] 实现消息协议解析
- [x] 调用 /v1/chat/completions API
- [x] 实现 cpp_send 工具
- [x] Termux 实机测试通过

### Phase 2: C++ 客户端开发 ✅

- [x] 头文件定义
- [x] Socket 连接管理
- [x] 消息发送/接收
- [x] CMake 构建配置
- [x] 示例程序 (demo.cpp, chat.cpp)
- [x] NDK 交叉编译 (Android)

### Phase 3: 验证测试 ✅

- [x] Ubuntu 环境验证
- [x] Termux 环境验证（Android）
- [x] 双向通信测试
- [ ] 性能测试

## 手机端配置（Termux）

```bash
# 安装 OpenClaw
pkg install nodejs
npm install -g openclaw

# 复制插件
cp -r openclaw-cpp-channel/plugin ~/.openclaw/extensions/cpp-channel

# 配置 openclaw.json
# 启动 Gateway
openclaw gateway start

# 运行 chat 客户端
./chat
```

## 技术栈

- **OpenClaw Plugin**: TypeScript
- **C++ Client**: C++17, POSIX Socket API
- **构建**: CMake, NDK (Android)
- **测试平台**: Ubuntu + Termux (Android)

## 许可证

MIT