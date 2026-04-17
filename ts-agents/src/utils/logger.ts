/**
 * @description 基于console的日志工具，支持设置输出颜色（默认白色）
 * @param message 日志内容
 * @param color 输出颜色，默认白色
 * @example
 * logger('Hello, world!', '32'); // 绿色
 * logger('Hello, world!', '33'); // 黄色
 * logger('Hello, world!', '34'); // 蓝色
 * logger('Hello, world!', '35'); // 紫色
 * logger('Hello, world!', '36'); // 青色
 * logger('Hello, world!', '37'); // 白色
 */
function logger(content: string, color: string = '37') {
  console.log(`\x1b[${color}m${content}\x1b[0m`);
}

export default logger;
