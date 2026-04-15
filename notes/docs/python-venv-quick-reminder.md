# Python 虚拟环境快速使用指南

## 激活虚拟环境
```bash
source venv/bin/activate
```

## 运行 Python 脚本
```bash
# 激活虚拟环境后直接运行
python your_script.py

# 或使用 Python 模块
python -m module_name
```

## 查看已安装的包
```bash
pip list
```

## 安装新包
```bash
pip install package_name
```

## 退出虚拟环境
```bash
deactivate
```

## 注意事项
- **每次新终端会话都需要激活虚拟环境**
- **虚拟环境特定于项目** - 每个项目使用自己的 venv
- **venv 文件夹** - 虚拟环境文件通常在项目根目录的 `venv/` 文件夹
- **不提交 venv** - 应该将 `venv/` 添加到 `.gitignore`
