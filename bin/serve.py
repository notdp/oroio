#!/usr/bin/env python3
import base64
import concurrent.futures
import hashlib
import http.server
import json
import os
import platform
import subprocess
import sys
import urllib.request
import urllib.error
from urllib.parse import unquote

SALT = b"oroio"
ITERATIONS = 10000
IS_WINDOWS = platform.system() == 'Windows'

def _derive_key_iv(salt: bytes) -> tuple:
    """PBKDF2-SHA256 派生 key(32) 和 iv(16)"""
    derived = hashlib.pbkdf2_hmac('sha256', SALT, salt, ITERATIONS, dklen=48)
    return derived[:32], derived[32:48]

if IS_WINDOWS:
    import ctypes
    from ctypes import wintypes
    
    bcrypt = ctypes.windll.bcrypt
    BCRYPT_AES_ALGORITHM = "AES"
    BCRYPT_CHAIN_MODE_CBC = "ChainingModeCBC"
    BCRYPT_CHAINING_MODE = "ChainingMode"
    
    class AESCipher:
        def __init__(self, key: bytes, iv: bytes):
            self.hAlg = ctypes.c_void_p()
            self.hKey = ctypes.c_void_p()
            self.iv = (ctypes.c_ubyte * len(iv))(*iv)
            bcrypt.BCryptOpenAlgorithmProvider(ctypes.byref(self.hAlg), BCRYPT_AES_ALGORITHM, None, 0)
            mode = BCRYPT_CHAIN_MODE_CBC.encode('utf-16-le') + b'\x00\x00'
            bcrypt.BCryptSetProperty(self.hAlg, BCRYPT_CHAINING_MODE, mode, len(mode), 0)
            bcrypt.BCryptGenerateSymmetricKey(self.hAlg, ctypes.byref(self.hKey), None, 0, key, len(key), 0)
        
        def decrypt(self, ciphertext: bytes) -> bytes:
            out_len = wintypes.ULONG()
            iv_copy = (ctypes.c_ubyte * len(self.iv))(*self.iv)
            bcrypt.BCryptDecrypt(self.hKey, ciphertext, len(ciphertext), None, iv_copy, len(iv_copy), None, 0, ctypes.byref(out_len), 1)
            out_buf = (ctypes.c_ubyte * out_len.value)()
            iv_copy = (ctypes.c_ubyte * len(self.iv))(*self.iv)
            bcrypt.BCryptDecrypt(self.hKey, ciphertext, len(ciphertext), None, iv_copy, len(iv_copy), out_buf, out_len.value, ctypes.byref(out_len), 1)
            return bytes(out_buf[:out_len.value])
        
        def encrypt(self, plaintext: bytes) -> bytes:
            pad_len = 16 - (len(plaintext) % 16)
            plaintext = plaintext + bytes([pad_len] * pad_len)
            out_len = wintypes.ULONG()
            iv_copy = (ctypes.c_ubyte * len(self.iv))(*self.iv)
            bcrypt.BCryptEncrypt(self.hKey, plaintext, len(plaintext), None, iv_copy, len(iv_copy), None, 0, ctypes.byref(out_len), 0)
            out_buf = (ctypes.c_ubyte * out_len.value)()
            iv_copy = (ctypes.c_ubyte * len(self.iv))(*self.iv)
            bcrypt.BCryptEncrypt(self.hKey, plaintext, len(plaintext), None, iv_copy, len(iv_copy), out_buf, out_len.value, ctypes.byref(out_len), 0)
            return bytes(out_buf[:out_len.value])
        
        def __del__(self):
            if self.hKey: bcrypt.BCryptDestroyKey(self.hKey)
            if self.hAlg: bcrypt.BCryptCloseAlgorithmProvider(self.hAlg, 0)

def decrypt_keys(keys_file: str) -> list:
    """解密 keys.enc 文件，返回 key 列表"""
    if not os.path.isfile(keys_file):
        return []
    try:
        if IS_WINDOWS:
            with open(keys_file, 'rb') as f:
                data = f.read()
            if len(data) < 17 or data[:8] != b'Salted__':
                return []
            salt, ciphertext = data[8:16], data[16:]
            key, iv = _derive_key_iv(salt)
            cipher = AESCipher(key, iv)
            text = cipher.decrypt(ciphertext).decode('utf-8')
        else:
            result = subprocess.run(
                ['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', keys_file, '-pass', f'pass:{SALT.decode()}'],
                capture_output=True
            )
            if result.returncode != 0:
                return []
            text = result.stdout.decode('utf-8')
        keys = []
        for line in text.split('\n'):
            line = line.strip()
            if line:
                keys.append(line.split('\t')[0])
        return keys
    except Exception:
        return []

def encrypt_keys(keys: list, keys_file: str):
    """加密 key 列表并写入文件"""
    text = '\n'.join(f"{k}\t" for k in keys)
    if IS_WINDOWS:
        import secrets
        salt = secrets.token_bytes(8)
        key, iv = _derive_key_iv(salt)
        cipher = AESCipher(key, iv)
        ciphertext = cipher.encrypt(text.encode('utf-8'))
        with open(keys_file, 'wb') as f:
            f.write(b'Salted__' + salt + ciphertext)
    else:
        subprocess.run(
            ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-out', keys_file, '-pass', f'pass:{SALT.decode()}'],
            input=text.encode('utf-8'),
            check=True
        )

API_URL = 'https://app.factory.ai/api/organization/members/chat-usage'
API_TIMEOUT = 4
FACTORY_DIR = os.path.join(os.path.expanduser('~'), '.factory')

def fetch_usage(key: str) -> dict:
    """获取单个 key 的用量信息"""
    result = {'BALANCE': 0, 'BALANCE_NUM': 0, 'TOTAL': 0, 'USED': 0, 'EXPIRES': '?', 'RAW': ''}
    try:
        req = urllib.request.Request(API_URL, headers={
            'Authorization': f'Bearer {key}',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        usage = data.get('usage')
        if not usage:
            result['RAW'] = 'no_usage'
            return result
        section = usage.get('standard') or usage.get('premium') or usage.get('total') or usage.get('main')
        if section:
            total = section.get('totalAllowance') or section.get('basicAllowance') or section.get('allowance')
            used = section.get('orgTotalTokensUsed') or section.get('used') or section.get('tokensUsed') or 0
            used += section.get('orgOverageUsed') or 0
            if total is not None:
                result['TOTAL'] = int(total)
                result['USED'] = int(used)
                result['BALANCE_NUM'] = int(total - used)
                result['BALANCE'] = result['BALANCE_NUM']
        exp_raw = usage.get('endDate') or usage.get('expire_at') or usage.get('expires_at')
        if exp_raw is not None:
            if isinstance(exp_raw, (int, float)) or (isinstance(exp_raw, str) and exp_raw.isdigit()):
                from datetime import datetime
                result['EXPIRES'] = datetime.utcfromtimestamp(int(exp_raw) / 1000).strftime('%Y-%m-%d')
            else:
                result['EXPIRES'] = str(exp_raw)
    except Exception:
        result['RAW'] = 'http_error'
        result['EXPIRES'] = 'Invalid key'
    return result

def fetch_all_usages(keys: list) -> list:
    """并发获取所有 key 的用量"""
    max_workers = min(6, len(keys)) if keys else 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(fetch_usage, keys))

def write_cache(keys_file: str, cache_file: str, keys: list, usages: list):
    """写入缓存文件，格式与 dk/dk.ps1 兼容"""
    import time
    now = int(time.time())
    keys_hash = hashlib.sha1(open(keys_file, 'rb').read()).hexdigest()
    lines = [str(now), keys_hash]
    for i, u in enumerate(usages):
        info = '\n'.join([
            f"BALANCE={u.get('BALANCE', 0)}",
            f"BALANCE_NUM={u.get('BALANCE_NUM', 0)}",
            f"TOTAL={u.get('TOTAL', 0)}",
            f"USED={u.get('USED', 0)}",
            f"EXPIRES={u.get('EXPIRES', '?')}",
            f"RAW={u.get('RAW', '')}"
        ])
        b64 = base64.b64encode(info.encode('utf-8')).decode('ascii')
        lines.append(f"{i}\t{b64}")
    with open(cache_file, 'w') as f:
        f.write('\n'.join(lines))

class OroioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, oroio_dir=None, dk_path=None, **kwargs):
        self.oroio_dir = oroio_dir
        self.dk_path = dk_path
        self.keys_file = os.path.join(oroio_dir, 'keys.enc')
        self.current_file = os.path.join(oroio_dir, 'current')
        self.cache_file = os.path.join(oroio_dir, 'list_cache.b64')
        super().__init__(*args, **kwargs)
    
    def _invalidate_cache(self):
        """删除缓存文件"""
        try:
            if os.path.exists(self.cache_file):
                os.remove(self.cache_file)
        except:
            pass
    
    def _get_current_index(self) -> int:
        try:
            with open(self.current_file, 'r') as f:
                return max(1, int(f.read().strip()))
        except:
            return 1
    
    def _set_current_index(self, idx: int):
        with open(self.current_file, 'w') as f:
            f.write(str(idx))
    
    def do_GET(self):
        path = unquote(self.path)
        if path.startswith('/data/'):
            self.serve_oroio_file(path[6:])
        else:
            super().do_GET()
    
    def do_POST(self):
        path = unquote(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ''
        
        try:
            data = json.loads(body) if body else {}
        except:
            data = {}
        
        if path == '/api/add':
            self.handle_add_key(data)
        elif path == '/api/remove':
            self.handle_remove_key(data)
        elif path == '/api/use':
            self.handle_use_key(data)
        elif path == '/api/refresh':
            self.handle_refresh()
        # Skills
        elif path == '/api/skills/list':
            self.handle_list_skills()
        elif path == '/api/skills/create':
            self.handle_create_skill(data)
        elif path == '/api/skills/delete':
            self.handle_delete_skill(data)
        # Commands
        elif path == '/api/commands/list':
            self.handle_list_commands()
        elif path == '/api/commands/create':
            self.handle_create_command(data)
        elif path == '/api/commands/delete':
            self.handle_delete_command(data)
        elif path == '/api/commands/content':
            self.handle_command_content(data)
        elif path == '/api/commands/update':
            self.handle_update_command(data)
        # Droids
        elif path == '/api/droids/list':
            self.handle_list_droids()
        elif path == '/api/droids/create':
            self.handle_create_droid(data)
        elif path == '/api/droids/delete':
            self.handle_delete_droid(data)
        # MCP
        elif path == '/api/mcp/list':
            self.handle_list_mcp()
        elif path == '/api/mcp/add':
            self.handle_add_mcp(data)
        elif path == '/api/mcp/remove':
            self.handle_remove_mcp(data)
        elif path == '/api/mcp/update':
            self.handle_update_mcp(data)
        else:
            self.send_error(404, 'Not Found')
    
    def serve_oroio_file(self, filename):
        if '..' in filename or filename.startswith('/'):
            self.send_error(403, 'Forbidden')
            return
        
        allowed_files = ['keys.enc', 'current', 'list_cache.b64']
        if filename not in allowed_files:
            self.send_error(404, 'Not Found')
            return
        
        filepath = os.path.join(self.oroio_dir, filename)
        
        if not os.path.isfile(filepath):
            if filename == 'list_cache.b64':
                # 首次启动缓存可能不存在，返回空内容避免 404 噪声
                content = b''
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Length', len(content))
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                return
            self.send_error(404, 'Not Found')
            return
        
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', len(content))
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))
    
    def handle_add_key(self, data):
        key = data.get('key', '').strip()
        if not key:
            self.send_json({'success': False, 'error': 'Key is required'})
            return
        try:
            keys = decrypt_keys(self.keys_file)
            keys.append(key)
            encrypt_keys(keys, self.keys_file)
            self._invalidate_cache()
            self.send_json({'success': True, 'message': f'已添加。当前共有 {len(keys)} 个key。'})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_remove_key(self, data):
        index = data.get('index')
        if not index:
            self.send_json({'success': False, 'error': 'Index is required'})
            return
        try:
            idx = int(index)
            keys = decrypt_keys(self.keys_file)
            if idx < 1 or idx > len(keys):
                self.send_json({'success': False, 'error': '序号超出范围'})
                return
            keys.pop(idx - 1)
            encrypt_keys(keys, self.keys_file)
            self._set_current_index(1)
            self._invalidate_cache()
            self.send_json({'success': True, 'message': f'已删除，剩余 {len(keys)} 个key。'})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_use_key(self, data):
        index = data.get('index')
        if not index:
            self.send_json({'success': False, 'error': 'Index is required'})
            return
        try:
            idx = int(index)
            keys = decrypt_keys(self.keys_file)
            if idx < 1 or idx > len(keys):
                self.send_json({'success': False, 'error': '序号超出范围'})
                return
            self._set_current_index(idx)
            self.send_json({'success': True, 'message': f'已切换到序号 {idx}'})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_refresh(self):
        try:
            keys = decrypt_keys(self.keys_file)
            if not keys:
                self.send_json({'success': True})
                return
            usages = fetch_all_usages(keys)
            write_cache(self.keys_file, self.cache_file, keys, usages)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def send_json(self, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
    
    # Skills handlers
    def handle_list_skills(self):
        skills_dir = os.path.join(FACTORY_DIR, 'skills')
        skills = []
        try:
            real_dir = os.path.realpath(skills_dir)
            for entry in os.listdir(real_dir):
                entry_path = os.path.join(real_dir, entry)
                if os.path.isdir(entry_path):
                    skill_file = os.path.join(entry_path, 'SKILL.md')
                    if os.path.isfile(skill_file):
                        skills.append({'name': entry, 'path': skill_file})
        except:
            pass
        self.send_json(skills)
    
    def handle_create_skill(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            skill_dir = os.path.join(FACTORY_DIR, 'skills', name)
            os.makedirs(skill_dir, exist_ok=True)
            skill_file = os.path.join(skill_dir, 'SKILL.md')
            with open(skill_file, 'w') as f:
                f.write(f'# {name}\n\nDescribe your skill instructions here.\n')
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_delete_skill(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            import shutil
            skill_dir = os.path.join(FACTORY_DIR, 'skills', name)
            shutil.rmtree(skill_dir)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    # Commands handlers
    def handle_list_commands(self):
        commands_dir = os.path.join(FACTORY_DIR, 'commands')
        commands = []
        try:
            real_dir = os.path.realpath(commands_dir)
            for entry in os.listdir(real_dir):
                if entry.endswith('.md'):
                    full_path = os.path.join(real_dir, entry)
                    if os.path.isfile(full_path):
                        commands.append({'name': entry[:-3], 'path': full_path})
        except:
            pass
        self.send_json(commands)
    
    def handle_create_command(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            commands_dir = os.path.join(FACTORY_DIR, 'commands')
            os.makedirs(commands_dir, exist_ok=True)
            cmd_file = os.path.join(commands_dir, f'{name}.md')
            with open(cmd_file, 'w') as f:
                f.write(f'# /{name}\n\nCommand instructions here.\n')
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_delete_command(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            cmd_file = os.path.join(FACTORY_DIR, 'commands', f'{name}.md')
            os.remove(cmd_file)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_command_content(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'error': 'Name is required'})
            return
        try:
            commands_dir = os.path.join(FACTORY_DIR, 'commands')
            real_dir = os.path.realpath(commands_dir)
            with open(os.path.join(real_dir, f'{name}.md'), 'r', encoding='utf-8') as f:
                content = f.read()
            self.send_json({'content': content})
        except Exception as e:
            self.send_json({'error': str(e)})
    
    def handle_update_command(self, data):
        name = data.get('name', '').strip()
        content = data.get('content', '')
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            commands_dir = os.path.join(FACTORY_DIR, 'commands')
            real_dir = os.path.realpath(commands_dir)
            with open(os.path.join(real_dir, f'{name}.md'), 'w', encoding='utf-8') as f:
                f.write(content)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    # Droids handlers
    def handle_list_droids(self):
        droids_dir = os.path.join(FACTORY_DIR, 'droids')
        droids = []
        try:
            real_dir = os.path.realpath(droids_dir)
            for entry in os.listdir(real_dir):
                if entry.endswith('.md'):
                    full_path = os.path.join(real_dir, entry)
                    if os.path.isfile(full_path):
                        droids.append({'name': entry[:-3], 'path': full_path})
        except:
            pass
        self.send_json(droids)
    
    def handle_create_droid(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            droids_dir = os.path.join(FACTORY_DIR, 'droids')
            os.makedirs(droids_dir, exist_ok=True)
            droid_file = os.path.join(droids_dir, f'{name}.md')
            with open(droid_file, 'w') as f:
                f.write(f'---\nname: {name}\ndescription: A custom droid\n---\n\n# {name}\n\nDroid instructions here.\n')
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_delete_droid(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            droid_file = os.path.join(FACTORY_DIR, 'droids', f'{name}.md')
            os.remove(droid_file)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    # MCP handlers
    def handle_list_mcp(self):
        mcp_file = os.path.join(FACTORY_DIR, 'mcp.json')
        servers = []
        try:
            with open(mcp_file, 'r') as f:
                config = json.load(f)
            if 'mcpServers' in config:
                for name, server in config['mcpServers'].items():
                    servers.append({
                        'name': name,
                        'command': server.get('command', ''),
                        'args': server.get('args', []),
                        'env': server.get('env', {})
                    })
        except:
            pass
        self.send_json(servers)
    
    def handle_add_mcp(self, data):
        name = data.get('name', '').strip()
        command = data.get('command', '').strip()
        args = data.get('args', [])
        if not name or not command:
            self.send_json({'success': False, 'error': 'Name and command are required'})
            return
        try:
            mcp_file = os.path.join(FACTORY_DIR, 'mcp.json')
            config = {'mcpServers': {}}
            try:
                with open(mcp_file, 'r') as f:
                    config = json.load(f)
                if 'mcpServers' not in config:
                    config['mcpServers'] = {}
            except:
                pass
            config['mcpServers'][name] = {'command': command, 'args': args}
            os.makedirs(FACTORY_DIR, exist_ok=True)
            with open(mcp_file, 'w') as f:
                json.dump(config, f, indent=2)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_remove_mcp(self, data):
        name = data.get('name', '').strip()
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            mcp_file = os.path.join(FACTORY_DIR, 'mcp.json')
            with open(mcp_file, 'r') as f:
                config = json.load(f)
            if 'mcpServers' in config and name in config['mcpServers']:
                del config['mcpServers'][name]
                with open(mcp_file, 'w') as f:
                    json.dump(config, f, indent=2)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_update_mcp(self, data):
        name = data.get('name', '').strip()
        server_config = data.get('config', {})
        if not name:
            self.send_json({'success': False, 'error': 'Name is required'})
            return
        try:
            mcp_file = os.path.join(FACTORY_DIR, 'mcp.json')
            config = {'mcpServers': {}}
            try:
                with open(mcp_file, 'r') as f:
                    config = json.load(f)
                if 'mcpServers' not in config:
                    config['mcpServers'] = {}
            except:
                pass
            config['mcpServers'][name] = server_config
            os.makedirs(FACTORY_DIR, exist_ok=True)
            with open(mcp_file, 'w') as f:
                json.dump(config, f, indent=2)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def log_message(self, format, *args):
        pass

def run(port, web_dir, oroio_dir, dk_path):
    os.chdir(web_dir)
    
    handler = lambda *args, **kwargs: OroioHandler(
        *args, oroio_dir=oroio_dir, dk_path=dk_path, **kwargs
    )
    
    with http.server.HTTPServer(('127.0.0.1', port), handler) as httpd:
        httpd.serve_forever()

if __name__ == '__main__':
    if len(sys.argv) != 5:
        print('Usage: serve.py <port> <web_dir> <oroio_dir> <dk_path>')
        sys.exit(1)
    
    port = int(sys.argv[1])
    web_dir = sys.argv[2]
    oroio_dir = sys.argv[3]
    dk_path = sys.argv[4]
    run(port, web_dir, oroio_dir, dk_path)
