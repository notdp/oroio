# droid key manager (dk)

用 Bash 写的轻量 CLI，用于批量管理 Factory droid API keys，查询余额/到期；仅在 `dk run` 时余额耗尽会自动轮换可用 key。

## 安装

```bash
chmod +x bin/dk
sudo ln -sf "$(pwd)/bin/dk" /usr/local/bin/dk  # 或自行放到 PATH
```

数据目录固定为 `~/.oroio`，无需配置。

## 快速上手

```bash
# 1) 添加一批 key（空格分隔）
dk add fk-xxxx fk-yyyy fk-zzzz

# 或从文件导入
dk add --file keys.txt   # 文件每行一个 key

# 2) 查看余额/到期与当前 key
dk list

# 3) 查看当前 key（会同时输出 export 行并尝试复制到剪贴板）
dk current

# 4) 使用当前 key 运行命令（若余额为 0 将自动轮换）
dk run curl https://example.com
```

## 命令

- `dk add <key...>` / `dk add --file <路径>`：添加 key。
- `dk list`：列出所有 key，实时查询余额/到期。
- `dk current`：显示当前 key，输出 `export FACTORY_API_KEY=...` 并尝试复制到剪贴板。
- `dk use <序号>`：切换当前 key（不传序号时提供交互菜单）。
- `dk run <命令...>`：使用当前 key 运行命令（注入 `FACTORY_API_KEY`，并在余额为 0 时自动轮换）。
- `dk rm <序号...>`：删除指定序号的 key。

## 数据存储

- 目录：`~/.oroio`
- `keys.tsv`：每行 `key<TAB>label`（label 目前未使用，可留空）
- `current`：当前 key 的序号（从 1 开始）

## 注意

- CLI 直接保存明文 key，请自行管理文件权限。
- 查询余额使用官方接口 `https://app.factory.ai/api/organization/members/chat-usage`，若返回字段发生变化，`dk list` 仍会展示原始返回的摘要。
