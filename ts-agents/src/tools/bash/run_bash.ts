import { exec } from "child_process";

const dangerousCommands = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];
const MAX_OUTPUT_LENGTH = 50000;

/**
 * @description 运行bash命令
 * @param command 命令
 * @returns 命令执行结果
 */
export function runBash(command: string): string {
  return new Promise((resolve, reject) => {
    if(dangerousCommands.some(dangerousCommand => command.includes(dangerousCommand))) {
      reject('Dangerous command blocked');
    }
    try {
      exec(command, (error, stdout, stderr) => {
        if(error) {
          reject(`exec encountered an error: ${error}`);
        }
        const out = stdout + stderr;
        const outClipped = out.slice(0, MAX_OUTPUT_LENGTH);
        resolve(outClipped);
      });
    } catch (error) {
      reject(`catch exec error: ${error}`);
    }
  });
}