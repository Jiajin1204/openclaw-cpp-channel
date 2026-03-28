# openclaw-cpp-channel

OpenClaw Channel 插件 - 通过 Unix Socket 与 C++ Native 服务双向通信

## 项目概述

本项目为 OpenClaw 开发一个 Channel 插件，通过 Unix Domain Socket 实现与 C++ Native 服务的双向消息通信。

### 背景

- **发起人**：罗同学（SOC 厂商底层开发）
- **目标平台**：Android 手机（交叉编译的 Node.js + OpenClaw）
- **验证平台**：Ubuntu（开发验证）

### 需求

1. **C++ → OpenClaw**：C++ Native 服务发送消息到 OpenClaw Agent 处理流程
2. **OpenClaw → C++**：Agent 回复通过 Socket 发回 C++ 服务
3. **双向通信**：消息注入 + 回复回传

## 技术方案

### 通信协议

```
Unix Domain Socket: /tmp/openclaw.sock (Ubuntu) 或 /data/local/tmp/openclaw.sock (Android)

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
       │  sendMessage()                               │  injectMessage()
       │  onMessage()                                 │  mycpp_send tool
       ▼                                              ▼
    JSON 协议                                   Agent Loop
```

## 项目结构

```
openclaw-cpp-channel/
├── plugin/                    # OpenClaw 插件
│   ├── openclaw.plugin.json  # 插件清单
│   ├── index.ts              # 入口
│   ├── package.json          # NPM 配置
│   └── src/
│       ├── channel.ts        # Channel 定义
│       ├── socket-server.ts  # Socket 服务器
│       ├── protocol.ts       # 协议解析
│       └── tools.ts          # Agent 工具
├── client/                   # C++ 客户端库
│   ├── include/
│   │   └── openclaw_client.h # 头文件
│   ├── src/
│   │   └── openclaw_client.cpp # 实现
│   └── CMakeLists.txt        # 构建配置
├── examples/                 # 示例
│   └── demo.cpp              # 简单示例
├── docs/                    # 文档
│   └── README.md             # 使用说明
└── README.md                 # 项目 readme
```

## 开发计划

### Phase 1: 插件开发（OpenClaw 侧）

- [ ] 创建插件框架
- [ ] 实现 Unix Socket Server
- [ ] 实现消息协议解析
- [ ] 实现 injectMessage 注入
- [ ] 实现工具注册（mycpp_send）
- [ ] 单元测试

### Phase 2: C++ 客户端开发

- [ ] 头文件定义
- [ ] Socket 连接管理
- [ ] 消息发送/接收
- [ ] CMake 构建配置
- [ ] 示例程序

### Phase 3: 验证测试

- [ ] Ubuntu 环境验证
- [ ] 双向通信测试
- [ ] 性能测试
- [ ] 文档完善

### Phase 4: 发布

- [ ] GitHub 仓库创建
- [ ] README 完善
- [ ] 版本发布

## 技术栈

- **OpenClaw Plugin**: TypeScript
- **C++ Client**: C++17, POSIX Socket API
- **构建**: CMake, npm

## 许可证

MIT