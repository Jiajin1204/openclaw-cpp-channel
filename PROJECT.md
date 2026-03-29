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
- 流式输出: {"type":"chunk","to":"user123","text":"逐"}
- 流式完成: {"type":"done","to":"user123"}
- 心跳: {"type":"ping"} / {"type":"pong"}
- 确认: {"type":"ack","id":1}
- 清除历史: {"type":"clear","from":"user123"}
```

### 架构

```
┌─────────────────┐        Unix Socket        ┌─────────────────┐
│   C++ Native    │ ◄──────────────────────► │   OpenClaw      │
│   Service       │    /tmp/openclaw.sock     │   Channel Plugin│
└─────────────────┘                          └─────────────────┘
       │                                              │
       │  sendMessage()                              │  HTTP /v1/chat/completions
       │  onChunk() (流式)                           │  cpp_send tool
       ▼                                              ▼
    JSON 协议                                   OpenAI-compatible API
```

## OpenClaw 插件系统

### 插件加载机制

OpenClaw 启动时扫描 `~/.openclaw/extensions/` 目录：
```
1. 扫描 extensions/ 目录下的子目录（每个子目录是一个插件）
           ↓
2. 读取 openclaw.plugin.json（插件清单）
           ↓
3. 检查 openclaw.json 中的 plugins.entries
           ↓
4. 如果 enabled: true，就加载插件
           ↓
5. 调用 plugin.register(api)
```

### 插件目录结构

```
~/.openclaw/extensions/
└── cpp-channel/          ← 目录名（可自定义，方便识别）
    ├── index.ts          ← 插件入口（必须）
    └── openclaw.plugin.json  ← 插件清单（声明身份）
```

### 插件声明（openclaw.plugin.json）

```json
{
  "id": "cpp-channel",      ← 插件唯一标识
  "name": "C++ Channel",
  "version": "1.0.0",
  "description": "Unix Socket channel for C++"
}
```

### 插件入口（index.ts）

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "cpp-channel",         // 必须和 openclaw.plugin.json 中的 id 一致
  name: "C++ Channel",
  configSchema: emptyPluginConfigSchema(),
  
  register(api: OpenClawPluginApi) {
    // api 提供：
    // - api.logger      日志
    // - api.config      配置
    // - api.registerTool()  注册工具给 Agent 调用
    
    // 启动 Socket 服务器
    // 监听消息
    // ...
  }
};

export default plugin;
```

### OpenClaw 配置（openclaw.json）

```json
{
  "channels": {
    "cpp-channel": {
      "enabled": true,
      "socketPath": "/tmp/openclaw.sock"
    }
  },
  "plugins": {
    "entries": {
      "cpp-channel": { "enabled": true }
    }
  }
}
```

### Channel Plugin 接口（完整定义）

OpenClaw 的 Channel Plugin 是一个大型接口，包含很多可选功能：

```typescript
type ChannelPlugin = {
  // 必须
  id: ChannelId;
  config: ChannelConfigAdapter;
  
  // 可选（按需实现）
  setup?: ChannelSetupAdapter;
  pairing?: ChannelPairingAdapter;
  outbound?: ChannelOutboundAdapter;      // 发送消息
  messaging?: ChannelMessagingAdapter;    // 接收消息
  streaming?: ChannelStreamingAdapter;     // 流式输出
  heartbeat?: ChannelHeartbeatAdapter;     // 心跳
  groups?: ChannelGroupAdapter;            // 群组
  agentTools?: ChannelAgentToolFactory;   // 代理工具
  lifecycle?: ChannelLifecycleAdapter;    // 生命周期
  // ...
}
```

**cpp-channel 只实现了部分接口**：
- `register()` - 插件入口
- Unix Socket 监听 - 消息接收
- HTTP 调用 - 消息发送
- 流式输出 - SSE 解析

### 配置说明

| 配置位置 | 说明 |
|----------|------|
| `channels.cpp-channel` | 插件配置（Socket 路径等） |
| `plugins.entries` | 告诉 OpenClaw 加载哪些插件 |
| 其他（models、gateway.auth 等） | OpenClaw 自身配置，与插件无关 |

## 项目结构

```
openclaw-cpp-channel/
├── plugin/                    # OpenClaw 插件
│   ├── openclaw.plugin.json  # 插件清单
│   ├── index.ts              # 入口
│   └── package.json
├── client/                   # C++ 客户端库
│   ├── include/
│   │   ├── openclaw_client.h # 头文件
│   │   └── simple_json.h     # JSON 库（单文件）
│   ├── src/
│   │   └── openclaw_client.cpp
│   ├── CMakeLists.txt
│   └── build.sh
├── examples/                 # 示例
│   ├── demo.cpp              # 简单示例
│   └── chat.cpp              # 交互式聊天客户端
├── docs/
│   └── DEVELOPMENT_LOG.md    # 开发日记（不上传 GitHub）
├── README.md                 # 使用说明
└── PROJECT.md               # 项目文档
```

## 快速开始

### 1. 安装插件

```bash
# 复制插件到 OpenClaw 扩展目录
cp -r plugin ~/.openclaw/extensions/cpp-channel
```

### 2. 配置 OpenClaw

在 `openclaw.json` 中添加：

```json
{
  "channels": {
    "cpp-channel": {
      "enabled": true,
      "socketPath": "/tmp/openclaw.sock"
    }
  },
  "plugins": {
    "entries": {
      "cpp-channel": { "enabled": true }
    }
  }
}
```

### 3. 编译 C++ 客户端

```bash
cd client
mkdir -p build && cd build
cmake ..
make

# Android 交叉编译
cmake .. -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake -DANDROID_ABI=arm64-v8a
```

### 4. 运行

1. 启动 OpenClaw Gateway
2. 运行 C++ 客户端：
   ```bash
   ./chat                         # 正常模式
   ./chat --debug                 # 调试模式（显示心跳）
   ./chat /path/to/socket --debug  # 指定 Socket 路径
   ```

## 手机端配置（Termux）

```bash
# 安装 OpenClaw
pkg install nodejs
npm install -g openclaw

# 复制插件
cp -r openclaw-cpp-channel/plugin ~/.openclaw/extensions/cpp-channel

# 配置 openclaw.json（参考上方配置）
# 启动 Gateway
openclaw gateway start

# 运行 chat 客户端
./chat
```

## 开发进度

### Phase 1-2: 基础框架 ✅ (2026-03-29)

- [x] 标准 ChannelPlugin 接口实现
- [x] gateway.startAccount 启动 Socket 服务器
- [x] messaging 接口（目标解析、路由）
- [x] outbound.sendPayload 发送回复
- [x] lifecycle 配置变更处理
- [x] configSchema 配置支持
- [x] status 状态报告
- [x] 流式输出
- [x] 短期记忆（简化版）

### Phase 3: OpenClaw 会话集成 ⏳

- [ ] dispatchInboundDirectDmWithRuntime 集成
- [ ] 让 OpenClaw 自动管理会话历史
- [ ] 享受 Token 压缩功能

### 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| Socket 通信 | ✅ | C++ ↔ Plugin 双向通信 |
| 流式输出 | ✅ | 逐字显示 AI 回复 |
| 短期记忆 | ✅ | 简化版（插件维护历史） |
| 标准接口 | ✅ | ChannelPlugin 完整接口 |
| DM 策略 | ✅ | open/pairing/allowlist/disabled |

### 当前架构

```
C++ 客户端 → Unix Socket → cpp-channel 插件 → HTTP /v1/chat/completions → Gateway
                                              ↓
                    插件维护历史 ← 当前方案
                                              ↓
                    OpenClaw 会话系统 ← 目标方案（Phase 3）
```

## 技术栈

- **OpenClaw Plugin**: TypeScript
- **C++ Client**: C++17, POSIX Socket API
- **JSON**: simple_json（轻量级单头文件库）
- **构建**: CMake, NDK (Android)
- **测试平台**: Ubuntu + Termux (Android)

## 许可证

MIT