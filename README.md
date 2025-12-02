# oroio

**Lightweight CLI for managing Factory Droid API keys with auto-rotation.**

[中文](README.zh-CN.md)

## What is dk?

dk manages multiple Factory Droid API keys in one place. It tracks usage limits and expiration dates, and automatically rotates to the next available key when one runs out—so your AI coding sessions never get interrupted.

### Perfect For

- **Heavy Droid Users** — Manage multiple API keys without manual switching
- **Team Environments** — Share key pools across machines
- **Uninterrupted Workflows** — Auto-rotation keeps sessions running

## Quick Start

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/notdp/oroio/main/install.sh | bash
```

The installer adds a `droid` alias to your shell. Restart your terminal, then just run `droid`.

### Basic Workflow

```bash
# 1. Add your API keys
dk add fk-xxxx fk-yyyy fk-zzzz

# Or import from file (one key per line)
dk add --file keys.txt

# 2. Check usage and expiration
dk list

# 3. Run droid (auto-injects key, auto-rotates on exhaustion)
droid
```

## Commands

| Command | Description |
|---------|-------------|
| `dk add <key...>` | Add one or more API keys |
| `dk add --file <path>` | Import keys from file |
| `dk list` | Show all keys with usage/expiration |
| `dk current` | Display current key and copy export command |
| `dk use <n>` | Switch to key by index |
| `dk rm <n...>` | Remove keys by index |
| `dk run <cmd>` | Run command with current key (auto-rotates) |
| `dk serve` | Start web dashboard on port 15915 |
| `dk reinstall` | Update to latest version |
| `dk uninstall` | Remove dk |

## Web Dashboard

```bash
dk serve        # Start dashboard
dk serve stop   # Stop dashboard
dk serve status # Check if running
```

Access at `http://localhost:15915` to view and manage keys visually.

## Installation Details

### What Gets Installed

- Binary: `~/.local/bin/dk`
- Data: `~/.oroio/`
- Shell alias: `droid` → `dk run droid`

### Updating

```bash
dk reinstall
```

### Uninstalling

```bash
dk uninstall
```

---

**Stop juggling API keys. Start shipping code.**
