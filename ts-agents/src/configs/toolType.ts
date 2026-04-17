/**
 * @description 工具基本类型
 * @property name 工具名称
 * @property description 工具描述
 * @property input_schema 工具输入模式
 */
export type TOOL_BASIC = {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties?: {
      [key: string]?: any;
    };
    required?: string[];
  },
};
