#!/usr/bin/env python3
import hashlib
import http.server
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

SALT = b"oroio"
ITERATIONS = 10000

def _ensure_crypto():
    """确保加密库可用，Windows 上自动安装 pycryptodome"""
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher
        return
    except ImportError:
        pass
    try:
        from Crypto.Cipher import AES
        return
    except ImportError:
        pass
    if os.name == 'nt':
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'pycryptodome'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def derive_key_iv(salt: bytes) -> tuple:
    """PBKDF2 派生 key 和 iv，与 dk.ps1/dk 兼容"""
    derived = hashlib.pbkdf2_hmac('sha256', SALT, salt, ITERATIONS, dklen=48)
    return derived[:32], derived[32:48]

def decrypt_keys(keys_file: str) -> list:
    """解密 keys.enc 文件，返回 key 列表"""
    if not os.path.isfile(keys_file):
        return []
    with open(keys_file, 'rb') as f:
        data = f.read()
    if len(data) < 17:
        return []
    if data[:8] != b'Salted__':
        return []
    salt = data[8:16]
    ciphertext = data[16:]
    key, iv = derive_key_iv(salt)
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives import padding
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        plaintext = unpadder.update(padded) + unpadder.finalize()
    except ImportError:
        # fallback: PyCryptodome
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import unpad
        cipher = AES.new(key, AES.MODE_CBC, iv)
        plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)
    text = plaintext.decode('utf-8')
    keys = []
    for line in text.split('\n'):
        line = line.strip()
        if line:
            keys.append(line.split('\t')[0])
    return keys

def encrypt_keys(keys: list, keys_file: str):
    """加密 key 列表并写入文件"""
    salt = secrets.token_bytes(8)
    key, iv = derive_key_iv(salt)
    text = '\n'.join(f"{k}\t" for k in keys)
    plaintext = text.encode('utf-8')
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives import padding
        padder = padding.PKCS7(128).padder()
        padded = padder.update(plaintext) + padder.finalize()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(padded) + encryptor.finalize()
    except ImportError:
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad
        cipher = AES.new(key, AES.MODE_CBC, iv)
        ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))
    with open(keys_file, 'wb') as f:
        f.write(b'Salted__' + salt + ciphertext)

class OroioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, oroio_dir=None, dk_path=None, **kwargs):
        self.oroio_dir = oroio_dir
        self.dk_path = dk_path
        self.keys_file = os.path.join(oroio_dir, 'keys.enc')
        self.current_file = os.path.join(oroio_dir, 'current')
        self.cache_file = os.path.join(oroio_dir, 'list_cache.b64')
        super().__init__(*args, **kwargs)

    def _dk_cmd(self, sub_args):
        """构造跨平台可执行的 dk 调用命令（仅用于 list 刷新缓存）"""
        if os.name == 'nt' and self.dk_path.lower().endswith('.ps1'):
            shell = 'pwsh' if shutil.which('pwsh') else 'powershell'
            return [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', self.dk_path, *sub_args]
        return [self.dk_path, *sub_args]
    
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
            result = subprocess.run(
                self._dk_cmd(['list']),
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                self.send_json({'success': True})
            else:
                self.send_json({'success': False, 'error': result.stderr.strip() or result.stdout.strip()})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def send_json(self, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
    
    def log_message(self, format, *args):
        pass

def run(port, web_dir, oroio_dir, dk_path):
    _ensure_crypto()
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
