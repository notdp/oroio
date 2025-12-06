import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Pencil, Terminal, Save, X, Copy, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { listCommands, createCommand, deleteCommand, getCommandContent, updateCommand, type Command } from '@/utils/api';

function CommandCard({ cmd, onEdit, onDelete, onCopy, copiedCommand }: {
  cmd: Command;
  onEdit: (name: string) => void;
  onDelete: (name: string) => void;
  onCopy: (name: string) => void;
  copiedCommand: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3 py-3 px-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-3">
            <code className="text-sm font-semibold font-mono text-foreground">/{cmd.name}</code>
            {cmd.description && (
              <span className="text-sm text-muted-foreground truncate">{cmd.description}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCopy(cmd.name)}
            title="Copy"
          >
            {copiedCommand === cmd.name ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(cmd.name)}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(cmd.name)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && cmd.content && (
        <div className="px-4 pb-3 pl-11">
          <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
            {cmd.content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function CommandsManager() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [commandToDelete, setCommandToDelete] = useState<string | null>(null);
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newCommandName, setNewCommandName] = useState('');
  const [newCommandDescription, setNewCommandDescription] = useState('');
  const [newCommandContent, setNewCommandContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopyCommand = async (name: string) => {
    try {
      const content = await getCommandContent(name);
      await navigator.clipboard.writeText(content);
      setCopiedCommand(name);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to copy');
    }
  };

  const loadCommands = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listCommands();
      setCommands(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commands');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const handleAddCommand = async () => {
    if (!newCommandName.trim()) return;
    setAdding(true);
    try {
      await createCommand(newCommandName.trim());
      // Update with description and content
      const content = newCommandDescription.trim()
        ? `---\ndescription: ${newCommandDescription.trim()}\n---\n\n${newCommandContent}`
        : newCommandContent || `# ${newCommandName.trim()}\n\nCommand instructions here.`;
      await updateCommand(newCommandName.trim(), content);
      setNewCommandName('');
      setNewCommandDescription('');
      setNewCommandContent('');
      setAddDialogOpen(false);
      await loadCommands();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create command');
    }
    setAdding(false);
  };

  const handleDeleteCommand = async () => {
    if (!commandToDelete) return;
    try {
      await deleteCommand(commandToDelete);
      await loadCommands();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete command');
    }
    setCommandToDelete(null);
  };

  const handleEditCommand = async (name: string) => {
    try {
      const content = await getCommandContent(name);
      setEditContent(content);
      setEditingCommand(name);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load command');
    }
  };

  const handleSaveCommand = async () => {
    if (!editingCommand) return;
    setSaving(true);
    try {
      await updateCommand(editingCommand, editContent);
      setEditingCommand(null);
      setEditContent('');
      await loadCommands();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save command');
    }
    setSaving(false);
  };

  const handleCancelEdit = () => {
    setEditingCommand(null);
    setEditContent('');
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
        <Button onClick={loadCommands}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{commands.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Status</span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-500">READY</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Type</span>
            <span className="text-sm font-bold font-mono text-foreground">SLASH</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="icon" onClick={loadCommands} className="h-8 w-8" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-8 text-xs px-3" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            NEW
          </Button>
        </div>
      </div>

      <div className="border border-border overflow-hidden">
        {commands.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Terminal className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No commands found</p>
            <p className="text-xs text-muted-foreground/70">~/.factory/commands/</p>
          </div>
        ) : (
          commands.map((cmd) => (
            <CommandCard
              key={cmd.name}
              cmd={cmd}
              onEdit={handleEditCommand}
              onDelete={setCommandToDelete}
              onCopy={handleCopyCommand}
              copiedCommand={copiedCommand}
            />
          ))
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Command</DialogTitle>
            <DialogDescription>Create a new command with name, description and content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name (without slash)</label>
              <Input
                placeholder="my-command"
                value={newCommandName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCommandName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="What this command does"
                value={newCommandDescription}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCommandDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                className="min-h-[200px] font-mono"
                placeholder="# Your Command&#10;&#10;Instructions here..."
                value={newCommandContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewCommandContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCommand} disabled={adding || !newCommandName.trim()}>
              {adding ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingCommand !== null} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono">/{editingCommand}</DialogTitle>
            <DialogDescription>Edit your command instructions.</DialogDescription>
          </DialogHeader>
          <Textarea
            className="flex-1 min-h-[400px] w-full font-mono resize-none"
            value={editContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
            placeholder="---
description: Your command description
---

# Your Command

Instructions here..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSaveCommand} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={commandToDelete !== null} onOpenChange={(open) => !open && setCommandToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete command "/{commandToDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the command file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCommand} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
