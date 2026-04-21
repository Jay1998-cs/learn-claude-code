import Anthropic from "@anthropic-ai/sdk";
import * as readline from 'readline/promises';
import { ROLE, SYSYEM_PROMPT } from "./configs/systemConstant.js";
import { TOOL_BASIC } from "./configs/toolType.js";
import { getEnvConfig } from "./utils/envConfig.js";
import { TOOL_NAME, TOOL_RESPONSE_TYPE, TOOL_RESULT_TYPE } from "./configs/toolConstant.js";
import { runBash } from "./tools/bash/run_bash.js";
import { runRead, runWrite, runEdit } from "./tools/file/index.js";
import logger from "./utils/logger.js";
import TodoManager, { TODO_STATUS, TodoItems } from "./tools/todo/TodoManager.js";
import path from "path";
import SkillLoader from "./skill/skillLoader.js";

// s05_skill_loading.py - Skills

// Two-layer skill injection that avoids bloating the system prompt:

//     Layer 1 (cheap): skill names in system prompt (~100 tokens/skill)
//     Layer 2 (on demand): full skill body in tool_result

//     skills/
//       pdf/
//         SKILL.md          <-- frontmatter (name, description) + body
//       code-review/
//         SKILL.md

//     System prompt:
//     +--------------------------------------+
//     | You are a coding agent.              |
//     | Skills available:                    |
//     |   - pdf: Process PDF files...        |  <-- Layer 1: metadata only
//     |   - code-review: Review code...      |
//     +--------------------------------------+

//     When model calls load_skill("pdf"):
//     +--------------------------------------+
//     | tool_result:                         |
//     | <skill>                              |
//     |   Full PDF processing instructions   |  <-- Layer 2: full body
//     |   Step 1: ...                        |
//     |   Step 2: ...                        |
//     | </skill>                             |
//     +--------------------------------------+

// Key insight: "Don't put everything in the system prompt. Load on demand."

// 声明
const ENV_CONFIG = getEnvConfig();
const { API_KEY, MODEL_ID, BASE_URL } = ENV_CONFIG;

const TOKEN = {
  TURN: 16000,
  STREAM: 64000,
}

const MAX_ROUNDS_SINCE_TODO = 3; // 连续未使用todo工具的最大轮数阈值
const todoManager = new TodoManager([]); // 初始化任务管理器，默认空任务列表

const WORKDIR = path.resolve(process.cwd()); // 当前工作目录
const SKILLS_DIR = path.join(WORKDIR, 'skills'); // skills目录

const SKILL_LOADER = new SkillLoader(SKILLS_DIR); // skills加载器
const SKILL_DESCRIPTIONS = SKILL_LOADER.getDescriptions(); // skill <name, description> 列表
const SKILL_PROMPT = `Skills available:\n${SKILL_DESCRIPTIONS}`; // skills prompt

const SYSTEM_PROMPT = `${SYSYEM_PROMPT}\n\n${SKILL_PROMPT}`; // system prompt
logger(`<<<<< system prompt: ${SYSTEM_PROMPT}`, '34');

// 工具列表
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
  {
    name: 'read_file',
    description: 'Read file contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace exact text in file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: TOOL_NAME.TODO,
    description: 'Update task list. Track progress on multi-step tasks.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              status: { type: 'string', enum: Object.values(TODO_STATUS) },
            },
            required: ['id', 'text', 'status'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: TOOL_NAME.LOAD_SKILL,
    description: 'Load specialized knowledge by name.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name to load',
        },
      },
      required: ['name'],
    },

  },
];

// subagent工具定义
const SUBAGENTS_TOOL: TOOL_BASIC = {
  name: 'task',
  description: 'Spawn a subagent with fresh context.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
      },
      description: {
        type: 'string',
        description: 'Short description of the task',
      },
    },
    required: ['prompt'],
  },
};

// parent agent可用工具列表
const PARENT_TOOLS: TOOL_BASIC[] = [
  ...TOOLS,
  SUBAGENTS_TOOL,
];

// subagents可用工具列表
const SUBAGENTS_TOOLS: TOOL_BASIC[] = [...TOOLS];

// 工具调度映射
const TOOL_HANDLERS: Record<string, (input: Record<string, any>) => string> = {
  bash: (input) => runBash(input.command),
  read_file: (input) => runRead(input.path, input.limit),
  write_file: (input) => runWrite(input.path, input.content),
  edit_file: (input) => runEdit(input.path, input.old_text, input.new_text),
  todo: (input) => todoManager.update(input.items),
  load_skill: (input) => SKILL_LOADER.getContent(input.name),
};

// 客户端
const client = new Anthropic({
  baseURL: BASE_URL,
  apiKey: API_KEY,
})

// 运行subagent
async function runSubagent(prompt: string) {
  const sub_messages = [{ role: ROLE.USER, content: prompt }]; // subagent独立的消息列表/上下文（clean context）
  const MAX_ROUNDS = 30; // subagent迭代轮次上限
  const MAX_CONTENT_LENGTH = 50000; // 内容长度上限
  let response;
  // 循环执行，最多MAX_ROUNDS轮
  for (let i = 0; i < MAX_ROUNDS; i++) {
    // 发送消息请求，获取LLM response 
    response = await client.messages.create({
      model: MODEL_ID,
      system: SYSTEM_PROMPT,
      messages: sub_messages,
      tools: SUBAGENTS_TOOLS,
      max_tokens: TOKEN.TURN,
    });
    // 添加LLM assistant角色响应内容
    sub_messages.push({
      role: ROLE.ASSISTANT,
      content: response?.content || '',
    });
    // 非工具调用，结束
    if (response?.stop_reason !== TOOL_RESPONSE_TYPE.TOOL_USE) {
      break;
    }
    // 工具调用，遍历response内容块，收集工具调用结果
    const blocks = response?.content || [];
    const results = [];
    for (const block of blocks) {
      if (block?.type === TOOL_RESPONSE_TYPE.TOOL_USE) {
        const blockName = block.name;
        const handler = TOOL_HANDLERS[blockName];
        const output = handler ?
          await handler(block.input) :
          `Unknown tool: ${blockName}`;
        results.push({
          type: TOOL_RESULT_TYPE.TOOL_RESULT,
          tool_use_id: block.id,
          content: output?.slice(0, MAX_CONTENT_LENGTH) || '',
        });
      }
    }
    // 将工具调用结果追加到subagent消息列表
    sub_messages.push({
      role: ROLE.USER,
      content: results,
    });
  }
  // 返回最终response的结果内容
  return response?.content ?
    response?.content.map(block => block?.text).filter(Boolean).join('\n') :
    '(no summary)';
}

// 主循环
async function agentLoop(messages: object[]) {
  try {
    let rounds_since_todo = 0; // 连续未使用todo工具的轮数
    while (true) {
      // 通过client.messages.create发送消息请求，返回 response 包含：
      // - response.content — 内容块数组（TextBlock、ThinkingBlock、ToolUseBlock 等）
      // - response.stop_reason — 停止原因：end_turn（正常结束）、tool_use（需要执行工具）、max_tokens（达到上限）等
      // - response.usage — token 用量统计
      const response = await client.messages.create({
        model: MODEL_ID,
        system: SYSTEM_PROMPT,
        messages: messages,
        tools: PARENT_TOOLS,
        max_tokens: TOKEN.TURN,
      });
      // 添加assistant角色响应内容
      messages.push({
        role: ROLE.ASSISTANT,
        content: response?.content || '',
      });
      // 非工具调用结束，直接返回
      if (response?.stop_reason !== TOOL_RESPONSE_TYPE.TOOL_USE) {
        return messages;
      }
      // 遍历消息内容块，收集工具调用结果
      const blocks = response?.content || []; // AI响应内容块数组
      const results = []; // 工具调用结果数组
      let used_todo = false; // 是否使用todo工具
      for (const block of blocks) {
        // 工具调用
        if (block?.type === TOOL_RESPONSE_TYPE.TOOL_USE) {
          // 通过调度映射执行工具
          const blockName = block.name;
          let output: string;
          if (blockName === TOOL_NAME.TASK) {
            // subagent工具调用
            const desc = block.input?.description || 'subtask';
            const prompt = block.input?.prompt || '';
            logger(`>>> [agentLoop]subagent task: ${desc} (${prompt.slice(0, 80)})`);
            output = await runSubagent(prompt);
            logger(`<<< [agentLoop]subagent output: ${output.slice(0, 200)}`, '33');
          } else {
            // 普通非subagent工具调用
            const handler = TOOL_HANDLERS[blockName];
            output = handler
              ? await handler(block.input as Record<string, any>)
              : `Unknown tool: ${blockName}`;
            logger(`>>> [agentLoop]tool name: ${blockName}`);
            logger(`<<< [agentLoop]tool output: ${output.slice(0, 200)}`, '33');
          }
          // 添加工具调用结果消息
          results.push({
            type: TOOL_RESULT_TYPE.TOOL_RESULT,
            tool_use_id: block.id,
            content: output,
          });
          // 当前使用todo工具标识
          if (blockName === TOOL_NAME.TODO) {
            used_todo = true;
          }
        }
      }
      // todo tool：及时注入reminder，避免遗忘任务
      rounds_since_todo = used_todo ? 0 : rounds_since_todo + 1;
      if (rounds_since_todo >= MAX_ROUNDS_SINCE_TODO) {
        results.push({
          type: TOOL_RESULT_TYPE.TEXT,
          text: '<reminder>Update your todos.</reminder>', // 额外注入reminder标签，提醒模型更新todos
        });
      }
      // 添加用户角色响应内容
      messages.push({
        role: ROLE.USER,
        content: results,
      });
    }
  } catch (error) {
    console.error('Error in agentLoop:', error);
    throw error;
  }
}

// 应用入口
async function main() {
  // 保存用户发送历史消息
  const history: object[] = [];
  // 循环程序
  while (true) {
    try {
      // 读取用户输入
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const query = await rl.question('\x1b[36m[main] input: \x1b[0m');
      rl.close();
      // 退出循环
      if (['q', 'exit', ''].includes(query?.trim().toLowerCase())) {
        break;
      }
      // 保存用户发送历史消息
      history.push({ role: ROLE.USER, content: query });
      // 执行主循环
      await agentLoop(history);
      // 打印最终的响应内容
      const responseContent = history[history.length - 1].content; // [{type: 'text', text: 'xxx'}, ...]
      logger(`[main] final responseContent: ${JSON.stringify(responseContent)}`);
      if (Array.isArray(responseContent)) {
        for (const block of responseContent) {
          if (Object.hasOwn(block, TOOL_RESULT_TYPE.TEXT)) {
            logger(`<<< [main] block text: ${block.text}`, '32');
          }
        }
      }
    } catch (error) {
      console.error('Error in main:', error);
    }
  }
}

// 开启应用
main();
