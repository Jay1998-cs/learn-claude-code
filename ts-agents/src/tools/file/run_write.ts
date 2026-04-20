import * as fs from "fs";
import * as path from "path";
import { safePath } from "../../utils/filePath.js";

/**
 * @description 写入文件内容
 * @param filePath 文件路径
 * @param content 写入内容
 * @returns 操作结果
 */
export function runWrite(filePath: string, content: string): string {
  try {
    const absolutePath = safePath(filePath);
    if(!fs.existsSync(path.dirname(absolutePath))) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true }); // 创建文件目录
    }
    fs.writeFileSync(absolutePath, content, "utf-8"); // 写入文件内容
    return `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}`; // 返回写入信息
  } catch (error) {
    return `Error: ${error}`;
  }
}
