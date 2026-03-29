# openclaw-cpp-channel

通过 Unix Socket 实现 OpenClaw 与 C++ Native 服务双向通信的插件。

## 项目概述

本项目为 OpenClaw 开发一个 Channel 插件，通过 Unix Domain Socket 与 C++ Native 服务通信。支持：

- ✅ 消息双向传递
- ✅ 流式输出（逐字显示）
- ✅ 短期记忆（多轮对话）
- ✅ Android NDK 交叉编译
- ✅ 配置文件灵活设置

### 架构

```
┌─────────────────┐        Unix Socket        ┌─────────────────┐
│   C++ Native     │ ◄──────────────────────► │   OpenClaw      │
│   Service        │    /tmp/openclaw.sock    │   Channel Plugin│
└─────────────────┘                          └─────────────────┘
       │                                              │
       │  sendMessage()                               │  HTTP /v1/chat/completions
       │  onChunk() (流式)                            │  cpp_send tool
       ▼                                              ▼
    JSON 协议                                   OpenAI-compatible API
```

## 编译

### 环境要求

- CMake >= 3.16
- C++17 编译器
- Android NDK（编译 Android 版本时）

### Linux 编译

```bash
cd client
mkdir -p build && cd build
cmake ..
make -j4

# 可执行文件位于 build/bin/chat
```

### Android 编译（交叉编译）

```bash
# 设置 NDK 路径
export ANDROID_NDK=$HOME/android-ndk-r27d/android-ndk-r27d

cd client
mkdir -p build && cd build
cmake .. \
    -DBUILD_EXAMPLES=ON \
    -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake \
    -DANDROID_ABI=arm64-v8a \
    -DANDROID_PLATFORM=android-24

make -j4

# 可执行文件位于 build/bin/chat
```

### 交叉编译说明

- **ABI**: `arm64-v8a`（ARM64 架构，大多数现代手机）
- **最低 Android 版本**: Android 7.0 (API 24)
- **静态链接**: 可执行文件无需额外依赖库

## 安装

### 1. 安装 OpenClaw

如果还没有安装 OpenClaw：

```bash
npm install -g openclaw
```

### 2. 安装插件

#### 方式一：从源码安装

```bash
# 复制插件到 OpenClaw 扩展目录
cp -r plugin ~/.openclaw/extensions/cpp-channel
```

#### 方式二：使用 clawhub（推荐）

```bash
openclaw claw install jiajin1204/cpp-channel
```

### 3. 配置 openclaw.json

在 OpenClaw 配置文件中添加：

```json
{
  "channels": {
    "cpp-channel": {
      "enabled": true,
      "socketPath": "/tmp/openclaw.sock",
      "stream": true
    }
  },
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

#### 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `socketPath` | `/tmp/openclaw.sock` | Unix Socket 文件路径 |
| `stream` | `true` | 是否启用流式输出 |
| `gatewayUrl` | `http://127.0.0.1:18790` | Gateway 地址 |
| `gatewayToken` | 空 | Gateway 认证 Token |

#### 不同环境示例

**Linux:**
```json
{
  "channels": {
    "cpp-channel": {
      "socketPath": "/tmp/openclaw.sock"
    }
  }
}
```

**Android (Termux):**
```json
{
  "channels": {
    "cpp-channel": {
      "socketPath": "/data/data/com.termux/files/home/openclaw.sock"
    }
  }
}
```

**其他位置:**
```json
{
  "channels": {
    "cpp-channel": {
      "socketPath": "/var/run/openclaw.sock"
    }
  }
}
```

### 4. 启动 Gateway

```bash
openclaw gateway start
# 或指定端口
openclaw gateway start --port 18790
```

### 5. 运行 C++ 客户端

```bash
# 基本用法
./chat

# 指定 Socket 路径
./chat /tmp/openclaw.sock

# 调试模式（显示心跳和系统消息）
./chat --debug
./chat /tmp/openclaw.sock --debug

# 查看帮助
./chat --help
```

## 通信协议

### 消息格式（JSON + 换行分隔）

**C++ → OpenClaw:**

```json
{"type":"send","from":"user1","text":"你好","id":1}
{"type":"ping"}
{"type":"clear","from":"user1"}
```

**OpenClaw → C++:**

```json
{"type":"reply","to":"user1","text":"回复内容"}
{"type":"chunk","to":"user1","text":"逐"}
{"type":"chunk","to":"user1","text":"字"}
...
{"type":"done","to":"user1"}
{"type":"pong"}
{"type":"ack","id":1}
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `send` | C++ → OpenClaw | 发送消息 |
| `reply` | OpenClaw → C++ | 非流式回复 |
| `chunk` | OpenClaw → C++ | 流式输出（逐字） |
| `done` | OpenClaw → C++ | 流式输出完成 |
| `ping/pong` | 双向 | 心跳检测 |
| `ack` | OpenClaw → C++ | 消息确认 |
| `clear` | C++ → OpenClaw | 清除会话历史 |

## C++ 客户端库

### 快速开始

```cpp
#include "openclaw_client.h"

using namespace openclaw;

// 创建客户端
auto client = OpenClawClient::Create("/tmp/openclaw.sock");

// 设置回调
client->onChunk([](const std::string& to, const std::string& text) {
    std::cout << text << std::flush;  // 流式输出
});

client->onDone([](const std::string& to) {
    std::cout << std::endl;  // 输出完成
});

// 连接
client->connect([](bool success) {
    std::cout << (success ? "连接成功" : "连接失败") << std::endl;
});

// 发送消息
client->sendMessage("user1", "你好");

// 保持运行...
std::this_thread::sleep_for(std::chrono::seconds(60));
```

### API 参考

```cpp
// 创建实例
static std::unique_ptr<OpenClawClient> Create(const std::string& socketPath);

// 连接/断开
void connect(ConnectCallback callback = nullptr);
void disconnect();
bool isConnected() const;

// 发送消息
bool sendMessage(const std::string& from, const std::string& text, int id = 1);
bool sendPing();
bool clearHistory(const std::string& from);

// 回调设置
void onMessage(MessageCallback callback);      // 非流式回复
void onChunk(ChunkCallback callback);          // 流式输出
void onDone(DoneCallback callback);           // 流式完成
void onAck(AckCallback callback);             // 消息确认
void onDisconnect(DisconnectCallback callback);
```

## 开发

### 项目结构

```
openclaw-cpp-channel/
├── plugin/                    # OpenClaw 插件（TypeScript）
│   ├── index.ts              # 入口
│   ├── openclaw.plugin.json # 插件清单
│   └── package.json
├── client/                   # C++ 客户端库
│   ├── include/
│   │   ├── openclaw_client.h
│   │   └── simple_json.h    # JSON 解析库
│   ├── src/
│   │   └── openclaw_client.cpp
│   ├── CMakeLists.txt
│   └── build.sh
├── examples/                  # 示例程序
│   ├── chat.cpp              # 交互式聊天
│   └── demo.cpp              # 简单演示
├── docs/
│   └── DEVELOPMENT_LOG.md   # 开发日志
├── PROJECT.md
└── README.md
```

### 调试

如果遇到问题，查看 Gateway 日志：

```bash
# Linux
tail -f ~/.openclaw/logs/gateway.log

# Termux (Android)
tail -f /data/data/com.termux/files/home/logs/gateway.log
```

## 常见问题

### Q: 连接失败？
A: 确保 Gateway 已启动，Socket 文件存在，路径正确。

### Q: 流式输出不完整？
A: 检查 Gateway 日志，确认 `chatCompletions` 端点已启用。

### Q: 如何修改 Socket 路径？
A: 在 `openclaw.json` 的 `channels.cpp-channel.socketPath` 中配置。

### Q: 支持多用户吗？
A: 当前版本每个用户有独立的会话历史，但共享同一个 Socket 连接。

## 技术栈

- **OpenClaw Plugin**: TypeScript
- **C++ Client**: C++17, POSIX Socket API
- **JSON**: simple_json（轻量级单头文件库）
- **构建**: CMake
- **测试平台**: Linux + Android (Termux)

## 许可证

MIT