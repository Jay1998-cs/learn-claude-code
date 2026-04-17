import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_MODEL_ID = 'glm-4.7';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

type EnvConfig = {
  API_KEY: string;
  MODEL_ID: string;
  BASE_URL: string;
};

// 获取环境变量配置
export function getEnvConfig(): EnvConfig {
  return {
    API_KEY: process.env.ANTHROPIC_API_KEY || '',
    MODEL_ID: process.env.MODEL_ID || DEFAULT_MODEL_ID,
    BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
  };
}
