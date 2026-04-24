# ts01~ts05 文件总结与技术分析

> 生成时间: 2025-01-06
> 分析范围: src/ts01_agent_loop.ts ~ src/ts05_skill_loading.ts

---

## 一、整体架构演进

这5个TypeScript文件展示了一个**AI编码代理系统**的渐进式演进路径，逐步构建出完整的功能架构。

---

## 二、文件演进对比

| 文件 | 核心功能 | 新增特性 | 关键洞察 |
|------|----------|----------|----------|
| **ts01_agent_loop.ts** | 基础LLM循环 | bash工具 | "整个AI编码代理的核心循环模式" |
| **ts02_tool_use.ts** | 多工具调度 | read/write/edit文件 | "工具调度映射实现可扩展性" |
| **ts03_todo_write.ts** | 任务跟踪 | todo工具 + reminder机制 | "代理可以跟踪自己的进度" |
| **ts04_subagent.ts** | 子代理协作 | task工具创建独立上下文 | "进程隔离带来上下文隔离" |
| **ts05_skill_loading.ts** | 技能动态加载 | load_skill工具 | "按需加载，避免系统提示膨胀" |

---

## 三、核心设计模式（所有文件共享）

### 1. Agent Loop 模式

```typescript
while (stop_reason === "tool_use") {
  response = await client.messages.create(...)
  execute tools
  append results
  // 循环继续，直到LLM停止调用工具
}
```

**流程图**:
```
+----------+      +-------+      +---------+
|   User   | ---> |  LLM  | ---> |  Tool   |
|  prompt  |      |       |      | execute |
+----------+      +---+---+      +----+----+
                      ^               |
                      |   tool_result |
                      +---------------+
                      (loop continues)
```

### 2. 消息历史累积

```typescript
messages.push({ role: ASSISTANT, content: response.content })
messages.push({ role: USER, content: tool_results })
```

---

## 四、各文件核心特性详解

### ts01 - 最小可行代理

**工具**: 仅bash

**目的**: 验证核心循环概念

**场景**: 简单命令执行

**关键代码**:
```typescript
const TOOLS: TOOL_BASIC[] = [
  {
    name: 'bash',
    description: 'Run a shell command.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
];
```

---

### ts02 - 文件操作能力

**工具**: bash + read_file + write_file + edit_file

**改进**: 引入`TOOL_HANDLERS`调度映射

**场景**: 代码编辑、文件读写

**关键代码**:
```typescript
const TOOL_HANDLERS: Record<string, (input: Record<string, any>) => string> = {
  bash: (input) => runBash(input.command),
  read_file: (input) => runRead(input.path, input.limit),
  write_file: (input) => runWrite(input.path, input.content),
  edit_file: (input) => runEdit(input.path, input.old_text, input.new_text),
};
```

---

### ts03 - 任务自跟踪

**工具**: 在ts02基础上增加todo工具

**机制**:
- `rounds_since_todo`计数器
- 超过3轮未使用todo → 注入`<reminder>`

**场景**: 多步骤任务进度管理

**关键代码**:
```typescript
let rounds_since_todo = 0;
const MAX_ROUNDS_SINCE_TODO = 3;

if(rounds_since_todo >= MAX_ROUNDS_SINCE_TODO) {
  results.push({
    type: 'text',
    text: '<reminder>Update your todos.</reminder>'
  });
}
```

**流程图**:
```
+----------+      +-------+      +---------+
|   User   | ---> |  LLM  | ---> | Tools   |
|  prompt  |      |       |      | + todo  |
+----------+      +---+---+      +----+----+
                      ^               |
                      |   tool_result |
                      +---------------+
                            |
                +-----------+-----------+
                | TodoManager state     |
                | [ ] task A            |
                | [>] task B <- doing   |
                | [x] task C            |
                +-----------------------+
                            |
                if rounds_since_todo >= 3:
                  inject <reminder>
```

---

### ts04 - 子代理隔离

**工具**: 新增task工具（创建subagent）

**隔离**: subagent使用独立的`sub_messages = []`

**优势**:
- 父代理上下文保持干净
- 子代理可独立运行最多30轮

**关键代码**:
```typescript
async function runSubagent(prompt: string) {
  const sub_messages = [{ role: USER, content: prompt }]; // fresh context
  const MAX_ROUNDS = 30;

  for(let i = 0; i < MAX_ROUNDS; i++) {
    // subagent独立循环...
  }
  return summary; // 只返回摘要给父代理
}
```

**流程图**:
```
Parent agent                     Subagent
+------------------+             +------------------+
| messages=[...]   |             | messages=[]      |  <-- fresh
|                  |  dispatch   |                  |
| tool: task       | ---------->| while tool_use:  |
|   prompt="..."   |            |   call tools     |
|   description="" |            |   append results |
|                  |  summary   |                  |
|   result = "..." | <--------- | return last text |
+------------------+             +------------------+
          |
Parent context stays clean.
Subagent context is discarded.
```

---

### ts05 - 按需技能加载

**工具**: 新增load_skill工具

**两层加载策略**:
- **Layer 1**: 技能元数据注入系统提示（~100 tokens/skill）
- **Layer 2**: 完整技能体按需加载

**场景**: PDF处理、代码审计等专业技能

**关键代码**:
```typescript
const SKILL_LOADER = new SkillLoader(SKILLS_DIR);
const SKILL_DESCRIPTIONS = SKILL_LOADER.getDescriptions();
const SKILL_PROMPT = `Skills available:\n${SKILL_DESCRIPTIONS}`;

load_skill: (input) => SKILL_LOADER.getContent(input.name)
```

**流程图**:
```
skills/
  pdf/
    SKILL.md          <-- frontmatter (name, description) + body
  code-review/
    SKILL.md

System prompt:
+--------------------------------------+
| You are a coding agent.              |
| Skills available:                    |
|   - pdf: Process PDF files...        |  <-- Layer 1: metadata only
|   - code-review: Review code...      |
+--------------------------------------+

When model calls load_skill("pdf"):
+--------------------------------------+
| tool_result:                         |
| <skill>                              |
|   Full PDF processing instructions   |  <-- Layer 2: full body
|   Step 1: ...                        |
|   Step 2: ...                        |
| </skill>                             |
+--------------------------------------+
```

---

## 五、依赖关系图

```
ts01 (基础循环)
  ↓ 增加4个文件工具
ts02 (多工具调度)
  ↓ 增加todo + reminder
ts03 (任务跟踪)
  ↓ 增加subagent隔离
ts04 (子代理)
  ↓ 增加skill动态加载
ts05 (技能系统)
```

---

## 六、代码审查结果

### 关键发现汇总

| 类别 | 问题数 | 严重程度 |
|------|--------|----------|
| 🔴 安全 | 4 | 高-中 |
| 🟡 可靠性 | 6 | 中 |
| 🔵 性能 | 2 | 低 |
| 🟢 代码质量 | 3 | 低 |

---

### 🔴 安全问题

#### 1. 命令注入风险 (ts01~ts05)

**位置**: 所有文件的bash工具
```typescript
bash: (input) => runBash(input.command)  // ⚠️ 未校验
```

**影响**: 恶意prompt可执行 `rm -rf /`

**修复建议**:
```typescript
// 添加白名单或沙箱
const ALLOWED_CMDS = ['ls', 'cat', 'grep', 'find'];
const cmd = input.command.split(' ')[0];
if (!ALLOWED_CMDS.includes(cmd)) {
  throw new Error(`Command not allowed: ${cmd}`);
}
```

---

#### 2. 路径遍历漏洞 (ts02~ts05)

**位置**: read_file/write_file/edit_file工具
```typescript
read_file: (input) => runRead(input.path, input.limit)  // ⚠️ 未校验路径
```

**影响**: 可读取 `../../../etc/passwd`

**修复建议**:
```typescript
import path from 'path';
const safePath = path.resolve(process.cwd(), input.path);
if (!safePath.startsWith(process.cwd())) {
  throw new Error('Path traversal detected');
}
```

---

#### 3. 无限循环风险 (ts01~ts05)

**位置**: 所有文件的agentLoop
```typescript
while (true) {  // ⚠️ 无退出条件
  // 可能无限调用工具
}
```

**修复建议**:
```typescript
const MAX_ROUNDS = 100;
for(let round = 0; round < MAX_ROUNDS; round++) {
  // ...
  if (response?.stop_reason !== TOOL_RESPONSE_TYPE.TOOL_USE) {
    return messages;
  }
}
```

---

#### 4. 资源耗尽 (ts04, ts05)

**位置**: runSubagent函数
```typescript
const MAX_CONTENT_LENGTH = 50000;  // ⚠️ 50KB可能OOM
```

**修复建议**:
- 改为动态限制或流式处理
- 添加内存使用监控

---

### 🟡 可靠性问题

#### 5. 错误处理不足

**位置**: 所有文件的agentLoop
```typescript
catch (error) {
  console.error('Error in agentLoop:', error);
  throw error;  // ⚠️ 直接抛出，未清理资源
}
```

**修复建议**:
```typescript
finally {
  rl?.close(); // 确保清理资源
}
```

---

#### 6. 类型不安全

**位置**: 所有文件
```typescript
messages: object[]  // ⚠️ 过于宽泛
response?.content || ''  // ⚠️ content是数组不应默认为字符串
```

**修复建议**:
```typescript
interface Message { 
  role: 'user'|'assistant'; 
  content: ContentBlock[] 
}
```

---

#### 7. 空输入校验缺失

**位置**: main函数
```typescript
const query = await rl.question(...);
if (['q', 'exit', ''].includes(query?.trim().toLowerCase())) {  // ⚠️ query可能为null
```

**修复建议**:
```typescript
if (!query) {
  continue;
}
```

---

#### 8. TODO reminder硬编码

**位置**: ts03, ts04, ts05
```typescript
const MAX_ROUNDS_SINCE_TODO = 3;  // ⚠️ 不可配置
```

**修复建议**: 移到配置文件

---

#### 9. 工具处理器类型错误

**位置**: ts02~ts05
```typescript
const TOOL_HANDLERS: Record<string, (input: Record<string, any>) => string>
// ⚠️ runRead等函数可能返回非string
```

---

### 🔵 性能问题

#### 10. 重复创建readline接口 (所有文件)

```typescript
const rl = readline.createInterface(...);  // 每次循环创建
const query = await rl.question(...);
rl.close();  // 关闭后重建
```

**优化建议**: 复用单个接口实例

---

#### 11. 大字符串拼接 (ts02~ts05)

```typescript
output.slice(0, 200)  // ⚠️ 多次slice操作
```

**优化建议**: 一次性截取并缓存

---

### 🟢 代码质量

#### 12. 魔法数字 (ts04, ts05)

```typescript
const MAX_ROUNDS = 30;
const MAX_CONTENT_LENGTH = 50000;
// ⚠️ 应提取为常量配置
```

---

#### 13. 重复代码

- agentLoop函数在5个文件中几乎相同
- **建议**: 提取为共享模块

---

#### 14. 注释优秀 ✅

- 所有文件都有清晰的ASCII图和关键洞察注释
- **这是好的实践**

---

## 七、优先修复建议

| 优先级 | 问题 | 影响范围 |
|--------|------|----------|
| **P0** | 命令注入/路径遍历 | 所有文件 |
| **P0** | 无限循环风险 | 所有文件 |
| **P1** | 错误处理改进 | 所有文件 |
| **P2** | 类型安全 | 所有文件 |
| **P3** | 性能优化 | 所有文件 |

---

## 八、总结

### 优点
- ✅ 架构清晰，演进路径合理
- ✅ 注释完善，包含ASCII流程图
- ✅ 设计模式优秀（循环、隔离、按需加载）
- ✅ 可扩展性强（工具调度映射）

### 需改进
- 🔴 **安全**: 必须添加命令和路径校验
- 🟡 **可靠性**: 加强错误处理和类型安全
- 🔵 **性能**: 优化资源复用

### 整体评价
**架构设计优秀，但需要加强安全防护和错误处理**

---

*文档生成自AI代码分析系统*
