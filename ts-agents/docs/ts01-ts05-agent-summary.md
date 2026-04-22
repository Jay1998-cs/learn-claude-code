# 从零构建 AI Coding Agent：ts01-ts05 实现演进

> 基于 [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 项目的 TypeScript 实现，从 30 行核心循环到具备子代理、技能加载的完整 Agent 系统。

---

## 一、核心概念

### 1.1 什么是 Agent？

**Agent（智能代理）** = LLM + 工具 + 循环。LLM 本身只能"说话"，无法读写文件、执行命令。Agent 的本质是通过一个循环让 LLM 决策"调用什么工具"，执行后把结果反馈回去，如此往复直到任务完成。

### 1.2 什么是 Agent Loop？

Agent Loop 是驱动 Agent 运转的核心模式，伪代码如下：

```
while stop_reason == "tool_use":
    response = LLM(messages, tools)   // LLM 决策
    execute tools                      // 执行工具
    append results                     // 结果回注
```

这个循环在 ts01 中约 30 行实现，后续 ts02-ts05 **从未修改过循环本身的控制逻辑**，所有新能力都是"层叠"上去的。

### 1.3 什么是 Tool？

**Tool（工具）** 是 Agent 与外部世界交互的接口。每个工具由 `name`、`description`、`input_schema` 定义，LLM 根据这些描述选择合适的工具并构造参数。

### 1.4 什么是 Harness？

在上述 Agent 架构中，LLM 是"大脑"，负责推理和决策；但大脑之外还需要一整套"外围系统"来处理 LLM 本身无法完成的工作——这就是 **Harness（线束/框架层）**。

**Harness** 是 Agent Loop 外围的控制逻辑层，负责管理 Agent 的运行时环境。如果说 Agent Loop 是发动机，Harness 就是整辆车的控制系统。它解决的核心问题是：LLM 只能在"回合"内思考和行动，但真实任务需要跨回合的状态管理、资源控制和生命周期治理。

```
┌─────────────────── Harness ──────────────────────┐
│                                                    │
│  ┌──────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ 状态管理  │   │  生命周期控制  │   │ 资源治理  │ │
│  │          │   │              │   │           │ │
│  │ • Todo   │   │ • 超时限制    │   │ • Token   │ │
│  │ • Tasks  │   │ • 轮次上限    │   │ • 文件沙箱 │ │
│  │ • Skills │   │ • 优雅关闭    │   │ • 并发控制 │ │
│  └──────────┘   └──────────────┘   └───────────┘ │
│                                                    │
│  ┌──────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ 上下文    │   │  通信协议     │   │ 执行隔离  │ │
│  │          │   │              │   │           │ │
│  │ • 压缩    │   │ • 消息收发    │   │ • 子代理  │ │
│  │ • 摘要    │   │ • 请求/响应   │   │ • Worktree│ │
│  │ • 身份重注│   │ • 广播       │   │ • 沙箱    │ │
│  └──────────┘   └──────────────┘   └───────────┘ │
│                                                    │
└────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
  ┌──────────────┐    ┌──────────────┐
  │  Agent Loop   │    │   LLM API    │
  │  (核心循环)   │    │  (推理引擎)  │
  └──────────────┘    └──────────────┘
```

**本文 ts01-ts05 中 Harness 的体现：**

| 章节 | Harness 能力 | 具体实现 |
|------|-------------|---------|
| ts01 | 轮次控制 | `while(true)` + `stop_reason` 退出 |
| ts02 | 资源治理 | `safePath()` 文件沙箱，`TOOL_HANDLERS` 统一调度 |
| ts03 | 状态管理 + 隐式引导 | `TodoManager` 跨轮次追踪 + reminder 注入 |
| ts04 | 执行隔离 + 生命周期 | `runSubagent()` 独立上下文 + `MAX_ROUNDS=30` 限制 |
| ts05 | 按需资源加载 | `SkillLoader` 两层注入，控制 token 预算 |

**参考资料 s06-s12 中 Harness 的演进：**

| 章节 | Harness 层 | 核心能力 |
|------|-----------|---------|
| s06 | 压缩 (Compression) | 三层上下文压缩：micro_compact → auto_compact → 手动 compact，实现无限会话 |
| s07 | 持久化任务 (Persistent Tasks) | 内存 Todo → 磁盘 Task DAG（`blockedBy` 依赖），跨重启存活 |
| s08 | 后台执行 (Background) | 守护线程执行慢命令，通知队列在下次 LLM 调用前注入结果 |
| s09 | 团队通信 (Team Mailboxes) | 多代理持久化 + JSONL 收件箱（append-only, drain-on-read）|
| s10 | 通信协议 (Protocols) | 请求-响应握手（shutdown/plan approval），`pending→approved/rejected` FSM |
| s11 | 自治 (Autonomy) | IDLE 阶段轮询 + 自动认领任务 + 身份重注入（压缩后恢复） |
| s12 | 目录隔离 (Worktree) | 任务与 git worktree 绑定，每个任务独立工作目录 + 事件流日志 |

> **一句话总结：** Agent Loop 回答"单次如何运转"，Harness 回答"长期如何治理"。生产级 Agent = Agent Loop + Harness。

### 1.5 核心数据结构

```
TOOL_BASIC (工具定义)
├── name: string                    // 工具名，如 "bash"
├── description: string             // 自然语言描述，供 LLM 理解用途
└── input_schema:                   // JSON Schema，定义输入参数
    ├── type: "object"
    ├── properties: { ... }
    └── required: [ ... ]
```

---

## 二、整体演进架构

```
ts01  Agent Loop          核心 while 循环 + bash 工具
 │
ts02  Tool Use            引入工具调度器 (TOOL_HANDLERS) + 文件操作工具
 │
ts03  TodoWrite           新增 TodoManager + reminder 注入机制
 │
ts04  Subagent            新增 runSubagent() + 上下文隔离
 │
ts05  Skill Loading       新增 SkillLoader + 两层技能注入
```

**设计原则：循环不变，能力层叠。** 每一层只做一件事——识别能力缺口，设计不修改循环的解决方案。

---

## 三、逐章详解

### 3.1 ts01: Agent Loop — 一切的基础

**解决的问题：** LLM 只能生成文本，不能执行任何实际操作。

**实现：** 最小可用的 Agent——1 个循环 + 1 个 bash 工具。

**核心流程：**

```
┌──────────┐     ┌───────┐     ┌──────────┐
│   User   │────>│  LLM  │────>│   bash   │
│  prompt  │     │       │     │  execute │
└──────────┘     └───┬───┘     └────┬─────┘
                     ^              │
                     │  tool_result │
                     └──────────────┘
                   (循环继续，直到 stop_reason != "tool_use")
```

**关键代码结构：**

```typescript
// ts01 核心循环（简化）
async function agentLoop(messages) {
  while (true) {
    const response = await client.messages.create({ model, system, messages, tools });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") return;  // 唯一退出条件

    // 执行工具，收集结果
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const output = await runBash(block.input["command"]);
        results.push({ type: "tool_result", tool_use_id: block.id, content: output });
      }
    }
    messages.push({ role: "user", content: results });
  }
}
```

**要点：**
- 只有 1 个工具 `bash`，工具执行是硬编码的 `if (block.type === "tool_use")`
- 退出条件单一：`stop_reason !== "tool_use"`
- 消息历史 `messages` 在整个会话中持续积累

---

### 3.2 ts02: Tool Use — 工具调度模式

**解决的问题：** 单一 bash 工具不够用，需要文件读写能力，且硬编码的执行逻辑不可扩展。

**新增能力：**
- 4 个工具：`bash`、`read_file`、`write_file`、`edit_file`
- **TOOL_HANDLERS 调度映射表**——将工具名映射到处理函数

**核心变化：** 工具执行从 `if-else` 硬编码变为字典查找：

```typescript
// ts01 (硬编码)
if (block.type === "tool_use") {
  const output = await runBash(block.input["command"]);
}

// ts02 (调度映射)
const TOOL_HANDLERS: Record<string, (input) => string> = {
  bash:       (input) => runBash(input.command),
  read_file:  (input) => runRead(input.path, input.limit),
  write_file: (input) => runWrite(input.path, input.content),
  edit_file:  (input) => runEdit(input.path, input.old_text, input.new_text),
};

// 循环中统一调用
const handler = TOOL_HANDLERS[block.name];
const output = handler ? await handler(block.input) : `Unknown tool: ${block.name}`;
```

**要点：**
- 新增工具只需在 `TOOLS` 数组加定义、在 `TOOL_HANDLERS` 加处理函数
- 安全机制：`safePath()` 防目录穿越
- **循环逻辑零改动**

---

### 3.3 ts03: TodoWrite — 任务自追踪

**解决的问题：** 面对多步骤复杂任务，LLM 容易遗忘进度、重复已完成的工作。

**新增能力：**
- `todo` 工具 + `TodoManager` 类
- **自动 reminder 注入**：连续 3 轮未更新 todo 时，注入 `<reminder>Update your todos.</reminder>`

**核心数据结构：**

```
TodoItem
├── id: string
├── text: string                          // 任务描述
└── status: "pending" | "in_progress" | "completed"

TodoManager
├── items: TodoItem[]                     // 任务列表（上限 20）
├── update(items): string                 // 更新并渲染
└── render(): string                      // 格式化输出
    约束: 同时只能有 1 个 in_progress
```

**核心流程——reminder 注入：**

```
┌──────────┐     ┌───────┐     ┌──────────┐
│   User   │────>│  LLM  │────>│  Tools   │
│  prompt  │     │       │     │ + todo   │
└──────────┘     └───┬───┘     └────┬─────┘
                     ^              │
                     │  tool_result │
                     └──────────────┘
                           │
               ┌───────────┴───────────┐
               │   TodoManager state   │
               │ [pending]   task A    │
               │ [in_progress] task B  │
               │ [completed] task C    │
               └───────────────────────┘
                           │
               if rounds_since_todo >= 3:
                 注入 <reminder>Update your todos.</reminder>
```

**关键代码：**

```typescript
// 追踪 todo 使用情况
let rounds_since_todo = 0;
let used_todo = false;

for (const block of blocks) {
  if (block.type === "tool_use") {
    // ... 执行工具 ...
    if (blockName === "todo") used_todo = true;
  }
}

// 注入 reminder
rounds_since_todo = used_todo ? 0 : rounds_since_todo + 1;
if (rounds_since_todo >= MAX_ROUNDS_SINCE_TODO) {  // 阈值 = 3
  results.push({ type: "text", text: "<reminder>Update your todos.</reminder>" });
}
```

**要点：**
- reminder 是一种**隐式引导**——不改变工具定义，通过在 tool_result 中注入文本来"提醒"模型
- TodoManager 的约束（最多 20 条、仅 1 个 in_progress）防止模型行为失控

---

### 3.4 ts04: Subagent — 上下文隔离

**解决的问题：** 长对话中，主代理的 messages 会积累大量中间细节（文件内容、命令输出），导致上下文膨胀、成本飙升、注意力分散。

**核心思想：** "进程隔离带来上下文隔离。" 子代理用全新的 `messages=[]` 运行，只返回摘要给父代理。

**新增数据结构：**

```
工具分层：
├── TOOLS (基础工具集): bash, read_file, write_file, edit_file, todo
├── PARENT_TOOLS = TOOLS + task          // 父代理多了 task 工具
└── SUBAGENTS_TOOLS = TOOLS              // 子代理不能创建子代理（防止递归）
```

**核心流程：**

```
Parent Agent                          Subagent
┌───────────────────┐                ┌───────────────────┐
│ messages=[...]    │                │ messages=[prompt] │  ← 全新上下文
│                   │   dispatch     │                   │
│ tool: task        │──────────────> │ while tool_use:   │
│   prompt="..."    │                │   call tools      │
│                   │    summary     │   append results  │
│ result = "..."    │<────────────── │ return last text  │
└───────────────────┘                └───────────────────┘
         │
  父代理上下文保持干净
  子代理上下文用完即弃
```

**关键代码——runSubagent：**

```typescript
async function runSubagent(prompt: string) {
  const sub_messages = [{ role: "user", content: prompt }]; // 全新上下文
  const MAX_ROUNDS = 30;         // 安全上限
  const MAX_CONTENT_LENGTH = 50000;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const response = await client.messages.create({
      model, system, messages: sub_messages, tools: SUBAGENTS_TOOLS
    });
    sub_messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") break;

    // 执行工具（复用 TOOL_HANDLERS）...
    sub_messages.push({ role: "user", content: results });
  }

  // 只返回最终文本摘要
  return response.content.map(b => b.text).filter(Boolean).join("\n");
}
```

**要点：**
- 子代理是**独立循环**，共享文件系统但拥有独立消息上下文
- 安全限制：`MAX_ROUNDS=30` 防无限循环，`SUBAGENTS_TOOLS` 不含 `task` 防递归嵌套
- 父代理循环中通过 `blockName === "task"` 分支特殊处理

---

### 3.5 ts05: Skill Loading — 按需知识注入

**解决的问题：** 将所有领域知识塞进 system prompt 会浪费大量 token（每个技能约 2000 tokens），但大多数任务只会用到其中一小部分。

**核心思想：** 两层注入——Layer 1 放元数据（~100 tokens/技能），Layer 2 按需加载完整内容。

**核心数据结构：**

```
SkillMeta
├── name?: string
├── description?: string
└── tags?: string

Skill
├── meta: SkillMeta            // frontmatter 解析结果
├── body: string               // SKILL.md 正文
└── path: string               // 文件路径

SkillLoader
├── skills: Map<string, Skill> // <name, Skill> 映射
├── loadAll()                  // 扫描 skills/ 目录
├── getDescriptions(): string  // Layer 1: 生成元数据文本
└── getContent(name): string   // Layer 2: 返回完整正文
```

**技能文件格式（SKILL.md）：**

```markdown
---
name: code-review
description: Perform thorough code reviews with security, performance...
---

# Code Review Skill
You now have expertise in conducting comprehensive code reviews...
```

**两层注入流程：**

```
Layer 1 — system prompt（始终存在，低成本）
┌──────────────────────────────────────┐
│ You are a universal agent.           │
│ Skills available:                    │
│   - code-review: Perform thorough... │  ← ~100 tokens
└──────────────────────────────────────┘

Layer 2 — load_skill 工具调用时注入
┌──────────────────────────────────────┐
│ tool_result:                         │
│ <skill name="code-review">           │
│   # Code Review Skill               │  ← ~2000 tokens
│   ## Review Checklist               │
│   ### 1. Security (Critical)...     │
│   ...                               │
│ </skill>                            │
└──────────────────────────────────────┘
```

**关键代码：**

```typescript
// 初始化
const SKILL_LOADER = new SkillLoader(SKILLS_DIR);
const SYSTEM_PROMPT = `${BASE_PROMPT}\n\nSkills available:\n${SKILL_LOADER.getDescriptions()}`;

// TOOL_HANDLERS 新增
load_skill: (input) => SKILL_LOADER.getContent(input.name),

// getContent 返回格式
`<skill name="${name}">\n${skill.body}\n</skill>`
```

**要点：**
- `SkillLoader` 启动时扫描 `skills/<name>/SKILL.md`，解析 YAML frontmatter
- 新增技能只需创建目录 + SKILL.md 文件，无需改代码
- Token 节省：假设 5 个技能，Layer 1 约 500 tokens，vs 全量加载 10000+ tokens

---

## 四、差异对比总览

| 维度 | ts01 | ts02 | ts03 | ts04 | ts05 |
|------|------|------|------|------|------|
| **工具数** | 1 (bash) | 4 (+文件操作) | 5 (+todo) | 6 (+task) | 7 (+load_skill) |
| **核心新增** | agentLoop | TOOL_HANDLERS | TodoManager + reminder | runSubagent | SkillLoader |
| **执行方式** | 硬编码 if | 字典调度 | 字典调度 | 字典调度 + 子循环 | 字典调度 + 子循环 |
| **消息上下文** | 单一 | 单一 | 单一 | 父子隔离 | 父子隔离 |
| **system prompt** | 静态 | 静态 | 静态 | 静态 | **动态拼接技能元数据** |
| **新增文件** | — | tools/file/ | tools/todo/ | — | skill/skillLoader.ts |
| **循环改动** | — | 无 | 无 | 无 | 无 |

### 循环不变性验证

ts01-ts05 的 `agentLoop` 控制流完全一致：

```
while true:
  response = LLM(messages, tools)
  messages.push(assistant, response.content)
  if stop_reason != "tool_use": return
  blocks → execute → results
  messages.push(user, results)
```

差异仅在 `execute` 阶段：
- ts01: 直接 `runBash()`
- ts02: `TOOL_HANDLERS[block.name]()`
- ts03: 同 ts02 + `rounds_since_todo` 追踪 + reminder 注入
- ts04/05: 同 ts03 + `task` 分支走 `runSubagent()`

---

## 五、关键设计原则

### 1. 循环不变原则
Agent Loop 在 ts01 确定后不再修改。所有新能力通过"工具定义 + 处理函数"叠加，不侵入核心循环。

### 2. Handler 模式
`TOOL_HANDLERS` 字典将工具名映射到处理函数，新增工具只需两步：加定义 + 加 handler。

### 3. 隐式引导
不改变 LLM 的推理逻辑，而是在 `tool_result` 中注入文本（如 `<reminder>`、`<skill>`）来引导行为。

### 4. 上下文隔离
子代理用独立的 `messages` 数组运行，避免主代理上下文被中间细节污染。

### 5. 按需加载
技能系统分两层——元数据常驻 prompt，完整内容按需加载，在功能丰富性和 token 成本之间取得平衡。

---

## 六、后续 TODO：s06-s12 补充计划

参考资料 [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 共包含 s01-s12 十二个章节，当前 ts-agents 项目实现了 s01-s05（TypeScript 版）。以下为 s06-s12 的内容概要，可作为后续补充完善的路线图：

```
s01→s05 (已实现)                                   s06→s12 (TODO)
═══════════════                                   ═════════════

Agent Loop ─┐                                     ┌─ Context Compact (s06)
Tool Use   ─┤                                     ├─ Task System (s07)
TodoWrite  ─┤  ← 当前文档覆盖范围                  ├─ Background Tasks (s08)
Subagent   ─┤                                     ├─ Agent Teams (s09)
Skill Load ─┘                                     ├─ Team Protocols (s10)
                                                  ├─ Autonomous Agents (s11)
                                                  └─ Worktree Isolation (s12)
```

### s06: Context Compact — 上下文压缩

**问题：** 上下文窗口有限，读 30 个文件 + 20 条命令就超 100K tokens。

**方案：** 三层递进压缩策略：
- **Layer 1 — micro_compact**：每轮静默执行，将 3 轮前的 tool_result 替换为 `[Previous: used {tool_name}]` 占位符
- **Layer 2 — auto_compact**：tokens 超阈值（50000）时，将完整 transcript 存盘，LLM 生成摘要替换全部消息
- **Layer 3 — compact 工具**：模型主动调用，触发与 auto_compact 相同的摘要逻辑

```
每一轮:
  tool_result → [micro_compact] → 检查 token 阈值 → [auto_compact] → 继续

关键: transcript 存盘不丢失，只是移出活跃上下文
```

### s07: Task System — 持久化任务图

**问题：** s03 的 TodoManager 是内存中的扁平列表，无排序、无依赖、压缩后丢失。

**方案：** 升级为磁盘持久化的 **Task DAG**（有向无环图），每个任务一个 JSON 文件：

```
.tasks/
  task_1.json  {id:1, status:"completed"}
  task_2.json  {id:2, blockedBy:[1], status:"pending"}
  task_3.json  {id:3, blockedBy:[1], status:"pending"}
  task_4.json  {id:4, blockedBy:[2,3], status:"pending"}

         task_1 (completed)
          /          \
    task_2          task_3       ← 可并行
    (pending)       (pending)
          \          /
         task_4 (blocked)        ← 等待 2 和 3 完成
```

- 4 个新工具：`task_create`、`task_update`、`task_list`、`task_get`
- 完成 task 时自动清除其他 task 的 `blockedBy` 依赖

### s08: Background Tasks — 后台执行

**问题：** `npm install`、`pytest` 等慢命令阻塞循环，模型空等。

**方案：** 守护线程执行命令，通知队列在下次 LLM 调用前注入结果：

```
主线程                     后台线程
agent loop                 subprocess 运行
  ...                        ...
  [LLM 调用前] ←─────────  enqueue(result)
    ↑ drain 通知队列

时间线: spawn A → spawn B → 其他工作 → A/B 结果在下一轮注入
```

- `BackgroundManager`：线程安全通知队列，`run()` 立即返回
- 循环保持单线程，仅子进程 I/O 并行化

### s09: Agent Teams — 多代理团队

**问题：** 子代理 (s04) 是一次性的，无身份、无记忆；后台任务 (s08) 只跑命令不能做 LLM 决策。

**方案：** 持久化队友 + 异步邮箱通信：

```
.team/
  config.json              ← 团队花名册 + 状态
  inbox/
    alice.jsonl             ← append-only, drain-on-read
    bob.jsonl
    lead.jsonl

alice ──send("bob","...")──→ bob.jsonl
bob   ──read_inbox("bob")──→ 读取并清空 → 注入 LLM 上下文
```

- 3 个新工具：`spawn`（创建队友线程）、`send`（发消息）、`read_inbox`（读收件箱）
- 队友状态机：`working → idle → working → ... → shutdown`

### s10: Team Protocols — 团队协议

**问题：** 队友间缺少结构化协调（优雅关闭、高风险变更审批）。

**方案：** 统一的请求-响应模式，`pending → approved | rejected` FSM：

```
Lead                     Teammate
  │──shutdown_req(id)──→│
  │                      │ 处理工作、保存状态
  │←─shutdown_resp(id)──│  approve: true/false

同一个 FSM 复用于:
  • 关闭协议 (shutdown_request / shutdown_response)
  • 计划审批 (plan_submit / plan_approval)
```

- `request_id` 关联请求与响应，支持并发多请求

### s11: Autonomous Agents — 自治代理

**问题：** 队友只能被指派任务，无法自主发现和认领工作。

**方案：** 队友 IDLE 阶段自动轮询，扫描任务板认领未分配任务：

```
WORK 阶段 → stop → IDLE 阶段
                     │
    ┌────────────────┼────────────────┐
    ▼                ▼                ▼
  检查 inbox     扫描 .tasks/     60s 超时
  有消息?        有未认领任务?      → SHUTDOWN
    │                │
    ▼                ▼
  回到 WORK      认领任务 → WORK

身份重注入: 压缩后 messages 过短时，插入 <identity> 块
```

### s12: Worktree + Task Isolation — 目录隔离

**问题：** 多代理共享同一目录，文件编辑冲突。

**方案：** 任务与 git worktree 绑定，每个任务独立工作目录：

```
控制面 (.tasks/)                  执行面 (.worktrees/)
task_1.json ←──── 绑定 ────→ auth-refactor/
  worktree: "auth-refactor"       branch: wt/auth-refactor

task_2.json ←──── 绑定 ────→ ui-login/
  worktree: "ui-login"            branch: wt/ui-login

收尾: worktree_keep() / worktree_remove(complete_task=true)
事件流: .worktrees/events.jsonl 记录完整生命周期
```

### 补充优先级建议

| 优先级 | 章节 | 理由 |
|--------|------|------|
| **高** | s06 Context Compact | 解决长会话 token 瓶颈，生产环境必备 |
| **高** | s07 Task System | 从扁平 Todo 到 DAG 任务图，是后续章节基础 |
| **中** | s08 Background Tasks | 提升执行效率，用户体验改善明显 |
| **中** | s09 Agent Teams | 多代理协作，架构复杂度显著提升 |
| **低** | s10-s12 | 在 s09 基础上细化，适合进阶研究 |

---

## 七、总结

从 ts01 到 ts05，我们看到了一个 AI Coding Agent 的完整构建路径：

```
30 行循环 (ts01)
  → 工具调度 (ts02)
    → 自追踪 (ts03)
      → 子代理隔离 (ts04)
        → 按需知识 (ts05)
          → 上下文压缩 (s06)      ← TODO
            → 持久任务图 (s07)
              → 后台执行 (s08)
                → 多代理团队 (s09)
                  → 通信协议 (s10)
                    → 自治代理 (s11)
                      → 目录隔离 (s12)
```

每一步都在回答同一个问题：**如何在不修改核心循环的前提下，为 Agent 添加新能力？** 答案始终是：新工具 + 新 handler + 适度的状态管理。ts01-ts05 聚焦 Agent Loop 本身的构建（"大脑如何运转"），s06-s12 则聚焦 Harness 层的治理（"系统如何持久运行"）。两者结合，才构成一个完整的生产级 Agent 系统。

---

> 参考：[learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) | 源码路径: `ts-agents/src/ts0{1..5}_*.ts`
