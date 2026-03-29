# cpp-channel 标准插件实现计划

## 开发原则

**增量原型开发** - 每个 Phase 完成后必须：
1. 能正常运行并测试
2. 保留简化版的核心功能
3. 可以推送到 GitHub
4. 不会破坏已有功能

---

## 开发步骤

### Phase 1: 基础框架 ✅ (已有简化版本)

**目标**: 保持现有功能可运行
**验证**: `./chat` 能连接并通信

---

### Phase 2: messaging 接口 ⏳

**目标**: 实现目标解析，不破坏现有功能
**验证**: `./chat --debug` 能显示解析的 target

#### Step 2.1: 更新插件入口

```typescript
// plugin/index.ts
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { cppChannelPlugin } from "./src/channel.js";
import { setCppChannelRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "cpp-channel",
  name: "C++ Channel",
  description: "Unix Socket channel for C++ Native service integration",
  plugin: cppChannelPlugin,
  setRuntime: setCppChannelRuntime,
});
```

#### Step 1.2: 创建 runtime.ts

```typescript
// plugin/src/runtime.ts
import type { CppChannelRuntime } from "./types.js";

let runtime: CppChannelRuntime | null = null;

export function setCppChannelRuntime(r: CppChannelRuntime) {
  runtime = r;
}

export function getCppChannelRuntime(): CppChannelRuntime {
  if (!runtime) throw new Error("CppChannel runtime not initialized");
  return runtime;
}
```

#### Step 1.3: 创建基础 types.ts

```typescript
// plugin/src/types.ts
import type { OpenClawConfig } from "openclaw/plugin-sdk";

export interface CppChannelAccount {
  accountId: string;
  configured: boolean;
}

export interface CppChannelConfig {
  // 插件配置
}

export interface CppChannelRuntime {
  config: {
    loadConfig(): OpenClawConfig;
  };
  channel: {
    text: {
      // 文本处理工具
    };
    cpp: {
      // C++ Socket 通信
    };
  };
}
```

---

### Phase 2: 核心接口 - messaging

#### Step 2.1: 实现 messaging 接口

```typescript
messaging: {
  // 目标规范化
  normalizeTarget: ({ raw }) => ({
    to: raw,  // C++ 客户端 ID
    chatType: "direct",
  }),
  
  // 解析明确目标
  parseExplicitTarget: ({ raw }) => ({
    to: raw,
    chatType: "direct" as const,
  }),
  
  // 推断聊天类型
  inferTargetChatType: ({ to }) => "direct",
  
  // 格式化显示
  formatTargetDisplay: ({ target }) => target,
  
  // 解析会话路由
  resolveOutboundSessionRoute: ({ to, accountId }) => ({
    channel: "cpp-channel",
    accountId,
    threadId: to,
  }),
},
```

---

## Phase 验收标准

每个 Phase 完成后必须满足：

1. **功能可用** - 现有 `./chat` 客户端能正常运行
2. **可测试** - 有明确的测试命令或输出
3. **可回滚** - 如果出问题，简化版本仍能工作
4. **已推送** - 每次完成都推送到 GitHub

---

### Phase 3: inbound（消息注入）⏳

**目标**: 消息进入 OpenClaw 会话系统，享受历史管理
**验证**: 多轮对话时 OpenClaw 能理解上下文（不再重复自我介绍）

#### Step 3.1: 创建消息接收处理

```typescript
// plugin/src/inbound-handler.ts

import { dispatchInboundDirectDmWithRuntime } from "openclaw/plugin-sdk";

export async function handleCppMessage(
  rawMessage: { from: string; text: string; id: number },
  runtime: CppChannelRuntime
) {
  const cfg = runtime.config.loadConfig();
  const accountId = "default";
  
  // 关键：使用 dispatchInboundDirectDmWithRuntime 注入消息
  await dispatchInboundDirectDmWithRuntime({
    cfg,
    channel: "cpp-channel",
    accountId,
    senderId: rawMessage.from,
    rawBody: rawMessage.text,
    runtime,  // 需要传递 runtime 以便获取回复
  });
}
```

#### Step 3.2: Socket 消息循环

```typescript
// plugin/src/socket-server.ts

import { createServer } from "net";

export function startCppSocketServer(runtime: CppChannelRuntime) {
  const cfg = runtime.config.loadConfig();
  const socketPath = cfg.channels?.["cpp-channel"]?.socketPath || "/tmp/openclaw.sock";
  
  const server = createServer((socket) => {
    let buffer = "";
    
    socket.on("data", async (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "send") {
            // 调用消息注入
            await handleCppMessage(msg, runtime);
          }
        } catch (e) { /* 忽略 */ }
      }
    });
  });
  
  server.listen(socketPath);
}
```

### Phase 4: outbound（消息发送）⏳

**目标**: Agent 回复通过标准接口发送
**验证**: `./chat` 能收到完整的 AI 回复

---

### Phase 5: 会话管理 ⏳

**目标**: OpenClaw 自动管理会话历史，Token 压缩
**验证**: 长对话测试，确认上下文不会被截断

```typescript
outbound: {
  base: {
    deliveryMode: "direct",
    sendPayload: async ({ to, payload, deps }) => {
      // 从 deps 获取 runtime 或直接使用
      const runtime = getCppChannelRuntime();
      
      // 将 OpenClaw 的回复发送到 C++ 客户端
      const text = runtime.channel.text.extractText(payload);
      const chunkMode = payload.metadata?.stream ? "streaming" : "single";
      
      // 通过 Socket 发送
      sendToCppSocket(to, text, chunkMode);
      
      return { success: true };
    },
  },
  
  attachedResults: {
    channel: "cpp-channel",
    sendText: async ({ to, text }) => {
      sendToCppSocket(to, text, "single");
      return { messageId: generateId() };
    },
  },
},
```

#### Step 4.2: 创建 Socket 发送函数

```typescript
// plugin/src/outbound-adapter.ts

let cppSocket: any = null;

export function setCppSocket(socket: any) {
  cppSocket = socket;
}

export function sendToCppSocket(to: string, text: string, mode: string) {
  if (!cppSocket) return;
  
  if (mode === "streaming") {
    // 流式发送
    for (const char of text) {
      cppSocket.write(JSON.stringify({
        type: "chunk",
        to,
        text: char,
      }) + "\n");
    }
    cppSocket.write(JSON.stringify({
      type: "done",
      to,
    }) + "\n");
  } else {
    // 单次发送
    cppSocket.write(JSON.stringify({
      type: "reply",
      to,
      text,
    }) + "\n");
  }
}
```

### Phase 6: 配置Schema ⏳

**目标**: 完善配置，支持 UI 显示
**验证**: `openclaw config show` 能看到 cpp-channel 配置

```typescript
// plugin/src/session-route.ts

export function resolveCppChannelOutboundSessionRoute(params: {
  to: string;
  accountId?: string;
  threadId?: string;
}) {
  return {
    channel: "cpp-channel",
    accountId: params.accountId || "default",
    threadId: params.to,  // 用 C++ 客户端 ID 作为 threadId
  };
}
```

#### Step 5.2: 配置允许列表

```typescript
// plugin/src/security.ts

export function createCppChannelAllowlistResolver() {
  return createScopedDmSecurityResolver<CppChannelAccount>({
    channelKey: "cpp-channel",
    resolvePolicy: (account) => account.config.dmPolicy || "open",
    resolveAllowFrom: (account) => account.config.allowFrom || ["*"],
  });
}
```

### Phase 7: 测试与文档 ⏳

**目标**: 完整测试覆盖，更新文档
**验证**: 所有功能测试通过，文档更新

```typescript
// plugin/src/config-schema.ts

import { z } from "zod";

export const CppChannelConfigSchema = {
  schema: {
    type: "object",
    properties: {
      socketPath: {
        type: "string",
        default: "/tmp/openclaw.sock",
        description: "Unix Socket file path",
      },
      stream: {
        type: "boolean",
        default: true,
        description: "Enable streaming output",
      },
      dmPolicy: {
        type: "string",
        enum: ["open", "pairing", "allowlist", "disabled"],
        default: "open",
        description: "Direct message policy",
      },
      allowFrom: {
        type: "array",
        items: { type: "string" },
        default: ["*"],
        description: "Allowed sender IDs",
      },
    },
  },
};
```

---

### Phase 7: 集成测试

#### Step 7.1: 创建测试用例

```typescript
// plugin/test/inbound.test.ts

test("receives message from C++ and injects to OpenClaw", async () => {
  // 模拟 C++ 客户端发送消息
  mockCppSocketReceive({
    type: "send",
    from: "test_user",
    text: "hello",
    id: 1,
  });
  
  // 验证消息被正确注入
  expect(dispatchInboundDirectDmWithRuntime).toHaveBeenCalledWith({
    senderId: "test_user",
    rawBody: "hello",
    channel: "cpp-channel",
  });
});
```

#### Step 7.2: 测试会话管理

```typescript
// plugin/test/session.test.ts

test("multiple messages maintain conversation context", async () => {
  // 发送两条消息
  await mockCppSocketReceive({ from: "user1", text: "hi" });
  await mockCppSocketReceive({ from: "user1", text: "how are you?" });
  
  // 验证两次消息在同一个会话中
  // OpenClaw 应该能理解上下文
});
```

---

## 文件结构

```
plugin/
├── index.ts                    # 插件入口（当前已存在）
├── src/
│   ├── channel.ts             # 主插件定义（新）
│   ├── runtime.ts             # Runtime 管理（新）
│   ├── types.ts               # 类型定义（新）
│   ├── config-schema.ts      # 配置Schema（新）
│   └── ...
└── test/                      # 测试
```

**注意**: 简化版本保留在 `index.ts` 中，作为 fallback

---

## 依赖的 OpenClaw SDK

```typescript
// 核心导入
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { dispatchInboundDirectDmWithRuntime } from "openclaw/plugin-sdk";
import {
  createScopedDmSecurityResolver,
  createTopLevelChannelConfigAdapter,
} from "openclaw/plugin-sdk/channel-config-helpers";
import { createComputedAccountStatusAdapter } from "openclaw/plugin-sdk/status-helpers";
import { attachChannelToResult } from "openclaw/plugin-sdk/channel-send-result";
```

---

## 时间预估

| Phase | 内容 | 复杂度 | 预估 |
|--------|------|--------|------|
| Phase 1 | 基础框架 | 中 | 1-2 天 |
| Phase 2 | messaging 接口 | 中 | 1 天 |
| Phase 3 | inbound（消息注入） | 高 | 2-3 天 |
| Phase 4 | outbound（消息发送） | 中 | 1-2 天 |
| Phase 5 | 会话管理 | 高 | 2-3 天 |
| Phase 6 | 配置Schema | 低 | 0.5 天 |
| Phase 7 | 测试 | 中 | 1-2 天 |
| **总计** | | | **8-14 天** |

---

## 风险点

1. **dispatchInboundDirectDmWithRuntime** 需要完整的 runtime 上下文
2. **outbound 回复路由** 需要正确解析 sessionKey
3. **流式输出** 需要在 outbound 中正确处理

---

## 下一步

1. 先实现 Phase 1-2，建立基础框架
2. 运行现有简化版本确认 Socket 通信正常
3. 然后逐步实现标准接口