# Todo Write - 任务进度跟踪

## 概述

`ts03_todo_write.ts` 实现了一个带任务进度跟踪的 AI Agent，通过 TodoManager 工具让模型自主追踪多步骤任务的执行状态。

## 核心机制

```
用户 → LLM → 工具调用 → TodoManager
                ↑
         状态追踪 + 提醒
```

## 关键特性

### 1. 任务状态管理
- **TodoManager**：维护任务列表状态
  - `[ ]` 待处理
  - `[>]` 进行中
  - `[x]` 已完成

### 2. 自动提醒机制
```typescript
const MAX_ROUNDS_SINCE_TODO = 3;
```
- 连续 3 轮未使用 todo 工具时，自动注入 `<reminder>Update your todos.</reminder>`
- 防止模型在执行复杂任务时遗忘进度更新

### 3. 工具集成

**可用工具：**
- `bash` - Shell 命令执行
- `read_file` - 文件读取
- `write_file` - 文件写入
- `edit_file` - 文件编辑
- `todo` - **任务状态更新（新增）**

### 4. 核心逻辑流程

```typescript
async function agentLoop(messages) {
  let rounds_since_todo = 0;
  
  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({...});
    
    // 2. 处理工具调用
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        // 执行工具（包括 todo）
        const output = TOOL_HANDLERS[block.name](block.input);
        results.push({ tool_use_id: block.id, content: output });
        
        // 检测 todo 使用
        used_todo = block.name === 'todo';
      }
    }
    
    // 3. 提醒机制
    rounds_since_todo = used_todo ? 0 : rounds_since_todo + 1;
    if (rounds_since_todo >= MAX_ROUNDS_SINCE_TODO) {
      results.push({ text: '<reminder>Update your todos.</reminder>' });
    }
    
    // 4. 返回结果继续循环
    messages.push({ role: 'user', content: results });
  }
}
```

## 关键洞察

> **"The agent can track its own progress -- and I can see it."**

模型通过 todo 工具：
- ✅ 自主管理任务状态
- ✅ 可视化执行进度
- ✅ 避免遗漏步骤

## 使用示例

```typescript
// 模型调用示例
await todo({
  items: [
    { id: "1", text: "分析代码结构", status: "completed" },
    { id: "2", text: "编写文档", status: "in_progress" },
    { id: "3", text: "测试验证", status: "pending" }
  ]
});
```

## 技术要点

| 组件 | 职责 |
|------|------|
| **TodoManager** | 任务状态存储与更新 |
| **Reminder** | 防止遗忘的状态检查器 |
| **Tool Handler** | 统一工具调度接口 |
| **Agent Loop** | 持续对话循环 |

## 对比

| 特性 | s02_basic | s03_todo_write |
|------|-----------|----------------|
| 任务追踪 | ❌ 无 | ✅ TodoManager |
| 状态可视化 | ❌ 隐式 | ✅ 显式 |
| 防遗忘机制 | ❌ 无 | ✅ Auto reminder |
| 复杂任务支持 | ⚠️ 有限 | ✅ 完整 |

---

**文件位置：** `ts-agents/ts03_todo_write.ts`
