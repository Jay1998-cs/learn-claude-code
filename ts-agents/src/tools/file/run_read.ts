import * as fs from "fs";
import { safePath } from "../../utils/filePath.js";

const MAX_OUTPUT_LENGTH = 50000;

/**
 * @description 读取文件内容
 * @param filePath 文件路径
 * @param limit 可选，读取行数限制
 * @returns 文件内容字符串
 */
export function runRead(filePath: string, limit?: number): string {
  try {
    const absolutePath = safePath(filePath);
    const text = fs.readFileSync(absolutePath, "utf-8");
    let lines = text.split("\n"); // 将文本按行分割
    if (limit && limit < lines.length) {
      lines = [...lines.slice(0, limit), `... (${lines.length - limit} more lines)`]; // 截取前limit行，并添加省略提示
    }
    return lines.join("\n").slice(0, MAX_OUTPUT_LENGTH);
  } catch (error) {
    return `Error: ${error}`;
  }
}
