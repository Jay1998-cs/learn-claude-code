import * as fs from 'fs';
import * as path from 'path';

// System prompt (Layer 1 -- always present):
// +--------------------------------------+
// | You are a coding agent.              |
// | Skills available:                    |
// |   - git: Git workflow helpers        |  ~100 tokens/skill
// |   - test: Testing best practices     |
// +--------------------------------------+

// When model calls load_skill("git"):
// +--------------------------------------+
// | tool_result (Layer 2 -- on demand):  |
// | <skill name="git">                   |
// |   Full git workflow instructions...  |  ~2000 tokens
// |   Step 1: ...                        |
// | </skill>                             |
// +--------------------------------------+


interface SkillMeta {
  name?: string;
  description?: string;
  tags?: string;
}

interface Skill {
  meta: SkillMeta;
  body: string;
  path: string;
}

/**
 * @description 扫描 skills/<name>/SKILL.md 文件，加载skills
 */
class SkillLoader {
  skill_dir: string = '';
  skills: Map<string, Skill> = new Map();

  constructor(skill_dir: string) {
    this.skill_dir = skill_dir;
    this.loadAll();
  }

  // 获取并处理所有skills
  loadAll() {
    if (!fs.existsSync(this.skill_dir)) {
      return;
    }
    const files = this.findSkillFiles(this.skill_dir);
    for (const file of files.sort()) {
      const text = fs.readFileSync(file, 'utf-8');
      const { meta, body } = this.parseFrontmatter(text);
      const name = meta?.name || path.basename(path.dirname(file));
      this.skills.set(name, { meta, body, path: file }); // 保存 <skillName, { meta, body, path }> 映射关
    }
  }

  // 递归扫描dir下的SKILL.md文件并获取格式化后的数据，返回处理后的结果列表
  findSkillFiles(dir: string): string[] {
    const SKILL_FILE_NAME = 'SKILL.md';
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findSkillFiles(fullPath));
      } else if (entry.name === SKILL_FILE_NAME) {
        results.push(fullPath);
      }
    }
    return results;
  }

  // 解析SKILL.md文件内容提取数据: { meta: SkillMeta, body: string }
  parseFrontmatter(text: string): { meta: SkillMeta, body: string } {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/);
    if (!match) {
      return { meta: {}, body: text.trim() };
    }
    const meta = this.parseSimpleYaml(match[1]) || {};
    return { meta, body: match[2].trim() };
  }

  // 解析YAML获取SkillMeta: { name, description, tags }
  parseSimpleYaml(yaml: string): SkillMeta {
    const meta: SkillMeta = {};
    for (const line of yaml.split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (m) {
        const key = m[1];
        let value: string = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        meta[key] = value;
      }
    }
    return meta;
  }

  // 获取skills的name、description、tags描述文本，即全部skill的元数据内容 ---- Layer 1
  getDescriptions(): string {
    if (this.skills.size === 0) {
      return "(no skills available)";
    }
    const lines: string[] = [];
    for (const [name, skill] of this.skills) {
      const desc = skill.meta.description || 'No description';
      const tags = skill.meta.tags || '';
      let line = `  - ${name}: ${desc}`;
      if (tags) {
        line += ` [${tags}]`;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  // 获取name对应skill的正文内容 ---- Layer 2
  getContent(name: string): string {
    const skill = this.skills.get(name);
    if (!skill) {
      return `Error: Unknown skill '${name}'. Available: ${Array.from(this.skills.keys()).join(', ')}`;
    }
    return `<skill name="${name}">\n${skill.body}\n</skill>`;
  }
}

export default SkillLoader;