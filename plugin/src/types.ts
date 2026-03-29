/**
 * cpp-channel TypeScript type definitions
 * 
 * Types for the standard OpenClaw Channel Plugin interface.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import type { DirectDmCommandAuthorizationRuntime } from "openclaw/plugin-sdk/direct-dm";

// ============================================================================
// Account Types
// ============================================================================

export interface CppChannelAccount {
  accountId: string;
  configured: boolean;
  config: CppChannelAccountConfig;
}

export interface CppChannelAccountConfig {
  socketPath: string;
  stream: boolean;
  dmPolicy: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
}

// ============================================================================
// Config Types
// ============================================================================

export interface CppChannelConfig {
  enabled?: boolean;
  socketPath?: string;
  stream?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom?: string[];
}

// ============================================================================
// Runtime Types - For dispatchInboundDirectDmWithRuntime
// ============================================================================

export interface CppChannelRuntime {
  config: {
    loadConfig(): OpenClawConfig;
  };
  channel: {
    text: {
      resolveMarkdownTableMode(params: {
        cfg: OpenClawConfig;
        channel: string;
        accountId: string;
      }): "standard" | "github" | "none";
      convertMarkdownTables(text: string, tableMode: string): string;
    };
    commands: DirectDmCommandAuthorizationRuntime;
    routing: {
      resolveAgentRoute(params: any): any;
    };
    session: {
      resolveStorePath(params: any): string;
      recordInboundSession(params: any): Promise<void>;
    };
  };
}

// ============================================================================
// Message Types
// ============================================================================

export interface CppInboundMessage {
  type: "send";
  from: string;
  text: string;
  id: number;
}

export interface CppOutboundChunk {
  type: "chunk";
  to: string;
  text: string;
}

export interface CppOutboundReply {
  type: "reply";
  to: string;
  text: string;
}

export interface CppOutboundDone {
  type: "done";
  to: string;
}

export interface CppOutboundAck {
  type: "ack";
  id: number;
}

export type CppMessage = CppInboundMessage | CppOutboundChunk | CppOutboundReply | CppOutboundDone | CppOutboundAck;