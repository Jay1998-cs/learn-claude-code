
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
