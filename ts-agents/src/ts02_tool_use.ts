import Anthropic from "@anthropic-ai/sdk";
import * as readline from 'readline/promises';
import { ROLE, SYSYEM_PROMPT } from "./configs/systemConstant.js";
import { TOOL_BASIC } from "./configs/toolType.js";
import { getEnvConfig } from "./utils/envConfig.js";
import { TOOL_RESPONSE_TYPE, TOOL_RESULT_TYPE } from "./configs/toolConstant.js";
import { runBash } from "./tools/bash/run_bash.js";
import { runRead, runWrite, runEdit } from "./tools/file/index.js";
import logger from "./utils/logger.js";

// s01_agent_loop.py - The Agent Loop
// The entire secret of an AI coding agent in one pattern:

//     while stop_reason == "tool_use":
//         response = LLM(messages, tools)
//         execute tools
//         append results

//     +----------+      +-------+      +---------+
//     |   User   | ---> |  LLM  | ---> |  Tool   |
//     |  prompt  |      |       |      | execute |
//     +----------+      +---+---+      +----+----+
//                           ^               |
//                           |   tool_result |
//                           +---------------+
//                           (loop continues)

// This is the core loop: feed tool results back to the model
// until the model decides to stop. Production agents layer
// policy, hooks, and lifecycle controls on top.

// 声明
const ENV_CONFIG = getEnvConfig();
const { API_KEY, MODEL_ID, BASE_URL } = ENV_CONFIG;

const SYSTEM_PROMPT = SYSYEM_PROMPT;

const TOKEN = {
  TURN: 16000,
  STREAM: 64000,
}

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
];

// 工具调度映射
const TOOL_HANDLERS: Record<string, (input: Record<string, any>) => string> = {
  bash: (input) => runBash(input.command),
  read_file: (input) => runRead(input.path, input.limit),
  write_file: (input) => runWrite(input.path, input.content),
  edit_file: (input) => runEdit(input.path, input.old_text, input.new_text),
};

// 客户端
const client = new Anthropic({
  baseURL: BASE_URL,
  apiKey: API_KEY,
})

// 主循环
async function agentLoop(messages: object[]) {
  try {
    while (true) {
      // 通过client.messages.create发送消息请求，返回 response 包含：
      // - response.content — 内容块数组（TextBlock、ThinkingBlock、ToolUseBlock 等）
      // - response.stop_reason — 停止原因：end_turn（正常结束）、tool_use（需要执行工具）、max_tokens（达到上限）等
      // - response.usage — token 用量统计
      const response = await client.messages.create({
        model: MODEL_ID,
        system: SYSTEM_PROMPT,
        messages: messages,
        tools: TOOLS,
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
      const blocks = response?.content || [];
      const results = [];
      for(const block of blocks) {
        // 工具调用
        if(block?.type === TOOL_RESPONSE_TYPE.TOOL_USE) {
          // 通过调度映射执行工具
          const handler = TOOL_HANDLERS[block.name];
          const output = handler
            ? await handler(block.input as Record<string, any>)
            : `Unknown tool: ${block.name}`;
          logger(`>>> [agentLoop]tool: ${block.name}`);
          logger(`<<< [agentLoop]tool output: ${output.slice(0, 200)}`, '33');
          // 添加工具调用结果消息
          results.push({
            type: TOOL_RESULT_TYPE.TOOL_RESULT,
            tool_use_id: block.id,
            content: output,
          });
        }
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
      const query = await rl.question('\x1b[36m[s01] input: \x1b[0m');
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
