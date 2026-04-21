/**
 * @description 工具响应类型
 * @property TOOL_USE 工具调用
 * @property THINKING 思考
 * @property END_TURN 结束回合
 * @property MAX_TOKENS token调用量上限
 */
export const TOOL_RESPONSE_TYPE:Record<string, string> = {
  TOOL_USE: 'tool_use',
  THINKING: 'thinking',
  END_TURN: 'end_turn',
  MAX_TOKENS: 'max_tokens',
}

/**
 * @description 工具结果类型
 * @property TOOL_RESULT 工具调用结果
 */
export const TOOL_RESULT_TYPE:Record<string, string> = {
  TOOL_RESULT: 'tool_result',
  TEXT: 'text',
}

/**
 * @description 工具名称
 */
export const TOOL_NAME:Record<string, string> = {
  BASH: 'bash',
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  EDIT_FILE: 'edit_file',
  TODO: 'todo',
  TASK: 'task',
}