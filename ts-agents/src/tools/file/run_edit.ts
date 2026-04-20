import * as fs from "fs";
import { safePath } from "../../utils/filePath.js";

/**
 * @description 替换文件的文本内容
 * @param filePath 文件路径
 * @param oldText 待替换文本
 * @param newText 替换后的文本
 * @returns 操作结果
 */
export function runEdit(filePath: string, oldText: string, newText: string): string {
  try {
    const absolutePath = safePath(filePath);
    const content = fs.readFileSync(absolutePath, "utf-8");
    if (!content.includes(oldText)) {
      return `Error: Text not found in ${filePath}`;
    }
    const updated = content.replace(oldText, newText); // 文本替换
    fs.writeFileSync(absolutePath, updated, "utf-8");
    return `Edited ${filePath}`;
  } catch (error) {
    return `Error: ${error}`;
  }
}
