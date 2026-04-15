# Pip Install 问题修复过程

## 问题描述
运行 `pip install -r requirements.txt` 命令失败

## 根本原因分析

### 问题 1: `command not found: pip`
- 系统只有 `pip3`，没有 `pip` 命令
- Python 3.13.2 通过 Homebrew 安装在 `/opt/homebrew/bin/python3`
- pip3 25.0 已安装

### 问题 2: `externally-managed-environment`
- Homebrew 的 Python 受 PEP 668 保护，防止系统级包安装
- 这是为了避免破坏系统 Python 安装

## 解决方案

### 步骤 1: 创建虚拟环境
```bash
python3 -m venv venv
```

### 步骤 2: 激活虚拟环境并安装
```bash
source venv/bin/activate
pip install -r requirements.txt
```

## 结果
✓ 成功安装所有包：
- anthropic 0.95.0
- python-dotenv 1.2.2
- PyYAML 6.0.3
- 及其他 15 个依赖包

## 经验总结
1. **优先使用虚拟环境** - 避免系统级包管理问题
2. **使用完整命令** - `python3 -m pip` 比 `pip` 更可靠
3. **理解错误信息** - PEP 668 错误提示已经很清楚，建议使用 venv
