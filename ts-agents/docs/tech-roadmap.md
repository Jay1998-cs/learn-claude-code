# ts-agents 技术路线

## 项目概述

TypeScript 实现的 AI 编码 Agent 框架，基于 Anthropic Claude API，展示了从基础 Agent 循环到高级能力（任务跟踪、子 Agent、技能加载）的完整演进路径。

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        ts-agents 架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐     │
│   │              Agent 主循环 (ts01-ts05)                │     │
│   │    while stop_reason == "tool_use":                  │     │
│   │      response = LLM(messages, tools)                 │     │
│   │      execute tools → append results                  │     │
│   │    return messages                                   │     │
│   └──────────────────────┬──────────────────────────────┘     │
│                          │                                      │
│         ┌────────────────┼────────────────┐                   │
│         ▼                ▼                ▼                   │
│   ┌──────────┐    ┌──────────┐    ┌──────────────┐           │
│   │  Tools   │    │   Todo   │    │  Subagents   │           │
│   │  Layer   │    │  Manager │    │   (ts04)     │           │
│   │          │    │  (ts03)  │    │              │           │
│   ├──────────┤    ├──────────┤    └──────────────┘           │
│   │ bash     │    │ pending  │                              │
│   │ read_file│    │ in_prog  │      ┌──────────────┐        │
│   │ write_   │    │ complete │      │   Skills     │        │
│   │ edit_file│    └──────────┘      │   (ts05)     │        │
│   │ todo     │                      ├──────────────┤        │
│   │ task     │                      │ Layer1: Meta │        │
│   │load_skill│                      │ Layer2: Body │        │
│   └──────────┘                      └──────────────┘        │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐     │
│   │              配置与工具模块                            │     │
│   │  configs/    tools/    utils/    skill/              │     │
│   └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## 技术栈

- **语言**: TypeScript (ES2022)
- **运行时**: Node.js 20+
- **AI SDK**: @anthropic-ai/sdk
- **工具链**: tsx, vitest, prettier

## 模块演进

### ts01_agent_loop - Agent 循环基础
- 实现核心 `while(tool_use)` 循环
- bash 工具集成
- 用户交互 REPL

### ts02_tool_use - 工具扩展
- 文件操作工具：read_file, write_file, edit_file
- 工具调度映射：TOOL_HANDLERS
- 工具结果回传机制

### ts03_todo_write - 任务跟踪
- TodoManager 状态管理
- 自动 reminder 注入（3轮未使用 todo）
- 任务状态：pending/in_progress/completed

### ts04_subagent - 子 Agent 隔离
- 独立消息上下文（context isolation）
- 父子 Agent 通信
- 子任务结果汇总返回

### ts05_skill_loading - 技能按需加载
- 两层加载策略：
  - Layer1: 元数据注入 system prompt (~100 tokens/skill)
  - Layer2: 完整内容按需加载 (~2000 tokens)
- SKILL.md frontmatter 解析

## 设计模式

1. **策略模式**: TOOL_HANDLERS 工具调度
2. **状态模式**: TodoManager 任务状态流转
3. **工厂模式**: SkillLoader 动态加载
4. **代理模式**: Subagent 上下文隔离

## 关键特性

- **类型安全**: 完整 TypeScript 类型定义
- **模块化**: 清晰的 configs/tools/utils 分层
- **可扩展**: 工具、技能、Agent 易于扩展
- **上下文管理**: 子 Agent 独立上下文
- **Token 优化**: 技能按需加载减少消耗

## 技术亮点

✨ **渐进式演进**: 从基础循环到高级能力，每步可独立运行  
✨ **上下文隔离**: 子 Agent 独立消息列表，避免污染父上下文  
✨ **按需加载**: 技能两层注入，平衡可用性与 Token 成本  
✨ **状态追踪**: TodoManager 提供任务进度可视化  
✨ **类型安全**: TypeScript 严格类型约束，减少运行时错误
