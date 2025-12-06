import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Plug, Copy, Check, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listMcpServers, removeMcpServer, updateMcpServer, type McpServer } from '@/utils/api';

export default function McpManager() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [copiedServer, setCopiedServer] = useState<string | null>(null);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [editConfig, setEditConfig] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerConfig, setNewServerConfig] = useState('{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "package-name"]\n}');

  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listMcpServers();
      setServers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const getServerConfig = (server: McpServer) => {
    const { name, ...config } = server;
    return JSON.stringify(config, null, 2);
  };

  const handleCopy = async (server: McpServer) => {
    await navigator.clipboard.writeText(getServerConfig(server));
    setCopiedServer(server.name);
    setTimeout(() => setCopiedServer(null), 2000);
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setEditConfig(getServerConfig(server));
  };

  const handleSaveEdit = async () => {
    if (!editingServer) return;
    try {
      const config = JSON.parse(editConfig);
      await updateMcpServer(editingServer.name, config);
      setEditingServer(null);
      await loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleAdd = async () => {
    if (!newServerName.trim()) return;
    try {
      const config = JSON.parse(newServerConfig);
      await updateMcpServer(newServerName.trim(), config);
      setNewServerName('');
      setNewServerConfig('{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "package-name"]\n}');
      setAddDialogOpen(false);
      await loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleDelete = async () => {
    if (!serverToDelete) return;
    try {
      await removeMcpServer(serverToDelete);
      await loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove');
    }
    setServerToDelete(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={loadServers}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{servers.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">STDIO</span>
            <span className="text-sm font-bold font-mono text-primary">{servers.filter(s => s.type !== 'http').length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">HTTP</span>
            <span className="text-sm font-bold font-mono text-foreground">{servers.filter(s => s.type === 'http').length.toString().padStart(2, '0')}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="icon" onClick={loadServers} className="h-8 w-8" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-8 text-xs px-3" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            ADD
          </Button>
        </div>
      </div>

      <div className="border border-border">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Plug className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No MCP servers configured</p>
            <p className="text-xs text-muted-foreground/70">~/.factory/mcp.json</p>
          </div>
        ) : (
          <div className="divide-y">
            {servers.map((server) => {
              const isExpanded = expandedServer === server.name;
              return (
                <div key={server.name} className="group">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                  >
                    <div className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{server.name}</span>
                        <Badge variant={server.type === 'http' ? 'default' : 'secondary'} className="text-xs">
                          {server.type || 'stdio'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {server.type === 'http' ? server.url : `${server.command} ${server.args?.join(' ') || ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(server)}
                        title="Copy config"
                      >
                        {copiedServer === server.name ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(server)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setServerToDelete(server.name)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pl-11">
                      <pre className="text-sm bg-muted/50 rounded-md p-3 overflow-x-auto">
                        <code>{getServerConfig(server)}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
            <DialogDescription>Configure a new MCP server.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Server Name</label>
              <Input
                placeholder="my-server"
                value={newServerName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewServerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Configuration (JSON)</label>
              <Textarea
                className="font-mono text-sm min-h-[150px]"
                value={newServerConfig}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewServerConfig(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newServerName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingServer !== null} onOpenChange={(open) => !open && setEditingServer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit "{editingServer?.name}"</DialogTitle>
            <DialogDescription>Modify the server configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Configuration (JSON)</label>
            <Textarea
              className="font-mono text-sm min-h-[200px]"
              value={editConfig}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditConfig(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingServer(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={serverToDelete !== null} onOpenChange={(open) => !open && setServerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{serverToDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the server from mcp.json.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
