# droid key manager (dk)

用 Bash 写的轻量 CLI，用于批量管理 Factory droid API keys，查询余额/到期；仅在 `dk run` 时余额耗尽会自动轮换可用 key。

## 安装

### 脚本安装 / 重装 / 卸载

- 安装（默认到 `$HOME/.local/bin`，脚本每次都会从 GitHub 获取最新 `dk`）：

  ```bash
  curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/install.sh | bash
  ```

- 安装脚本会安装 `dk` 并在 shell rc 文件中添加 `alias droid='dk run droid'`，重新打开终端后可直接运行 `droid`。

- 重装（先卸载再覆盖）：

  ```bash
  curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/reinstall.sh | bash
  ```

- 卸载：

  ```bash
  curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/uninstall.sh | bash
  ```

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

# 4) 直接运行 droid（安装时已配置 alias，自动注入 key 并支持轮换）
droid
```

## 命令

- `dk add <key...>` / `dk add --file <路径>`：添加 key。
- `dk list`：列出所有 key，实时查询余额/到期。
- `dk current`：显示当前 key，输出 `export FACTORY_API_KEY=...` 并尝试复制到剪贴板。
- `dk use <序号>`：切换当前 key（不传序号时提供交互菜单）。
- `dk run <命令...>`：使用当前 key 运行命令（注入 `FACTORY_API_KEY`，并在余额为 0 时自动轮换）。
- `dk uninstall [--prefix <dir>]`：卸载 dk，每次从远程获取 `uninstall.sh` 执行。
- `dk reinstall [--prefix <dir>]`：重装 dk，每次从远程获取 `reinstall.sh` 执行（可用 `--prefix` 设定安装目录，通常无需配置环境变量）。
- `dk rm <序号...>`：删除指定序号的 key。

## 数据存储

- 目录：`~/.oroio`
- `keys.tsv`：每行 `key<TAB>label`（label 目前未使用，可留空）
- `current`：当前 key 的序号（从 1 开始）

## 注意

- CLI 直接保存明文 key，请自行管理文件权限。
- 查询余额使用官方接口 `https://app.factory.ai/api/organization/members/chat-usage`，若返回字段发生变化，`dk list` 仍会展示原始返回的摘要。
