import * as path from "path";

const WORKDIR = process.cwd(); // 工作目录

/**
 * @description 安全路径校验，防止路径逃逸
 * @param p 相对路径
 * @returns 绝对路径
 */
export function safePath(p: string): string {
  const resolved = path.resolve(WORKDIR, p); // 将相对路径转换为绝对路径
  if (!resolved.startsWith(WORKDIR)) { // 检查路径是否在工作目录内
    throw new Error(`Path escapes workspace: ${p}`); // 如果路径不在工作目录内，抛出错误
  }
  return resolved; // 返回绝对路径
}
