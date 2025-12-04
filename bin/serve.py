#!/usr/bin/env python3
import http.server
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

class OroioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, oroio_dir=None, dk_path=None, **kwargs):
        self.oroio_dir = oroio_dir
        self.dk_path = dk_path
        super().__init__(*args, **kwargs)

    def _dk_cmd(self, sub_args):
        """构造跨平台可执行的 dk 调用命令。

        Windows 安装的是 dk.ps1，直接把 .ps1 当可执行文件会触发
        "[WinError 193] %1 不是有效的 Win32 应用程序"。这里检测 .ps1
        后用 PowerShell 解释执行；其他平台保持原行为。
        """

        if os.name == 'nt' and self.dk_path.lower().endswith('.ps1'):
            # 优先使用 pwsh，其次退回 Windows 自带 powershell
            shell = 'pwsh' if shutil.which('pwsh') else 'powershell'
            return [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', self.dk_path, *sub_args]
        return [self.dk_path, *sub_args]
    
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
            result = subprocess.run(
                self._dk_cmd(['add', key]),
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                # 刷新缓存改为异步，避免阻塞前端请求（Windows 上 dk list 可能很慢）
                try:
                    subprocess.Popen(
                        self._dk_cmd(['list']),
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                except Exception:
                    pass
                self.send_json({'success': True, 'message': result.stdout.strip()})
            else:
                self.send_json({'success': False, 'error': result.stderr.strip() or result.stdout.strip()})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_remove_key(self, data):
        index = data.get('index')
        if not index:
            self.send_json({'success': False, 'error': 'Index is required'})
            return
        
        try:
            result = subprocess.run(
                self._dk_cmd(['rm', str(index)]),
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                self.send_json({'success': True, 'message': result.stdout.strip()})
            else:
                self.send_json({'success': False, 'error': result.stderr.strip() or result.stdout.strip()})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)})
    
    def handle_use_key(self, data):
        index = data.get('index')
        if not index:
            self.send_json({'success': False, 'error': 'Index is required'})
            return
        
        try:
            result = subprocess.run(
                self._dk_cmd(['use', str(index)]),
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                self.send_json({'success': True, 'message': result.stdout.strip()})
            else:
                self.send_json({'success': False, 'error': result.stderr.strip() or result.stdout.strip()})
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
