import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, RefreshCw, Terminal, CheckCircle2, Copy, Circle, X, AlertTriangle, Download, Upload, ArrowUp, ArrowDown, ChevronsUpDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { sounds } from '@/lib/sound';
import { decryptKeys, maskKey } from '@/utils/crypto';
import { fetchEncryptedKeys, fetchCurrentIndex, fetchCache, addKey, removeKey, useKey, refreshCache, isElectron, checkDk } from '@/utils/api';
import type { KeyInfo } from '@/utils/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
} from "@/components/ui/alert-dialog"

function formatNumber(n: number | null): string {
  if (n === null) return '?';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toString();
}

type SortField = 'percent' | 'quota' | 'expiry';
type SortDirection = 'asc' | 'desc';
interface SortConfig {
  field: SortField | null;
  direction: SortDirection;
}

const SORT_STORAGE_KEY = 'oroio-key-sort';
const NOTES_STORAGE_KEY = 'oroio-key-notes';

function loadNotes(): Record<string, string> {
  try {
    const saved = localStorage.getItem(NOTES_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore parse errors
  }
  return {};
}

function saveNote(key: string, note: string) {
  const notes = loadNotes();
  if (note.trim()) {
    notes[key] = note;
  } else {
    delete notes[key];
  }
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function loadSortConfig(): SortConfig {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore parse errors
  }
  return { field: null, direction: 'asc' };
}

function saveSortConfig(config: SortConfig) {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(config));
}

function SortableHeader({ field, label, align = 'left', sortConfig, onSort, className }: {
  field: SortField;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = sortConfig.field === field;
  return (
    <TableHead
      className={cn(
        "text-xs tracking-wider cursor-pointer select-none transition-colors group",
        align === 'right' && "text-right",
        align === 'center' && "text-center",
        isActive ? "text-foreground" : "hover:text-foreground",
        className
      )}
      onClick={() => onSort(field)}
    >
      <span className={cn("inline-flex items-center gap-1.5", align === 'right' && "justify-end", align === 'center' && "justify-center")}>
        {label}
        <span className={cn(
          "inline-flex items-center justify-center w-4 h-4 rounded transition-all",
          isActive ? "bg-primary/15 text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground group-hover:bg-muted"
        )}>
          {isActive ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" />
          )}
        </span>
      </span>
    </TableHead>
  );
}



function KeyDisplay({ keyText, isCurrent, className }: { keyText: string, isCurrent: boolean, className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(keyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn("flex items-center gap-2 group cursor-pointer select-none w-fit", className)}
      onClick={handleCopy}
      title="Click to copy key"
    >
      <code className={cn("text-sm relative font-mono transition-colors", isCurrent && "font-medium text-cyan-600 dark:text-cyan-400")}>
        {maskKey(keyText)}
      </code>
      <div className="w-4 h-4 flex items-center justify-center">
        {copied ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all duration-200" />
        )}
      </div>
    </div>
  );
}

function NoteCell({ keyText, onUpdate }: { keyText: string; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(() => loadNotes()[keyText] || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    saveNote(keyText, note);
    setEditing(false);
    onUpdate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setNote(loadNotes()[keyText] || '');
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full px-1.5 py-0.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Note..."
      />
    );
  }

  return (
    <div
      className="flex items-center gap-1 group cursor-pointer min-h-[24px]"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      <span className="text-xs text-muted-foreground">
        {note || '-'}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function IconCopyButton({ text, icon: Icon, title, className }: { text: string; icon: any; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className={cn("h-8 w-8", className)} title={title}>
      {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Icon className="h-4 w-4" />}
    </Button>
  );
}

export function showDkMissingToast(installCmd: string) {
  sounds.notify();
  const renderId = Date.now();
  toast.custom((t) => (
    <div className="flex flex-col w-[320px] bg-card border border-border shadow-xl relative overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-amber-500/10 rounded blur-sm" />
          <div className="relative flex items-center justify-center w-9 h-9 bg-card border border-amber-500/20 text-amber-500 rounded shadow-sm">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-bold font-mono text-foreground tracking-wide">DK_NOT_FOUND</p>
            <button
              onClick={() => toast.dismiss(t)}
              className="text-muted-foreground/70 hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Install <code className="font-mono text-amber-500/70">dk</code> to enable key rotation.
          </p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={() => {
            sounds.click();
            navigator.clipboard.writeText(installCmd);
            toast.dismiss(t);
          }}
          className="flex items-center justify-center w-full gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[10px] font-medium transition-colors hover:text-primary-foreground hover:border-primary/50 group/btn"
        >
          <Terminal className="w-3 h-3 group-hover/btn:text-primary" />
          <span>COPY INSTALL COMMAND</span>
        </button>
      </div>

      <div className="h-0.5 bg-muted w-full">
        <div
          key={renderId}
          className="h-full bg-amber-500 animate-shrink-width"
          onAnimationEnd={() => toast.dismiss(t)}
        />
      </div>
    </div>
  ), { duration: Infinity, id: 'dk-not-found' });
}

export default function KeyList() {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [newKey, setNewKey] = useState('');
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);
  const [, setNotesVersion] = useState(0);

  const handleSort = (field: SortField) => {
    const newConfig: SortConfig = {
      field: sortConfig.field === field && sortConfig.direction === 'desc' ? null : field,
      direction: sortConfig.field === field ? (sortConfig.direction === 'asc' ? 'desc' : 'asc') : 'asc',
    };
    if (newConfig.field === null) newConfig.direction = 'asc';
    setSortConfig(newConfig);
    saveSortConfig(newConfig);
  };

  const sortedKeys = [...keys].sort((a, b) => {
    if (!sortConfig.field) return 0;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.field) {
      case 'percent': {
        const pA = a.usage?.total ? (a.usage.used || 0) / a.usage.total : -1;
        const pB = b.usage?.total ? (b.usage.used || 0) / b.usage.total : -1;
        return (pA - pB) * dir;
      }
      case 'quota': {
        const qA = a.usage?.used ?? -1;
        const qB = b.usage?.used ?? -1;
        return (qA - qB) * dir;
      }
      case 'expiry': {
        const eA = a.usage?.expires || '';
        const eB = b.usage?.expires || '';
        return eA.localeCompare(eB) * dir;
      }
      default:
        return 0;
    }
  });

  const loadData = useCallback(async (showRefreshing = false, autoRefresh = true, silent = false) => {
    try {
      if (!silent) {
        if (showRefreshing) setRefreshing(true);
        else setLoading(true);
      }
      setError(null);

      const [encryptedData, currentIndex, cache] = await Promise.all([
        fetchEncryptedKeys(),
        fetchCurrentIndex(),
        fetchCache(),
      ]);

      const decryptedKeys = decryptKeys(encryptedData);

      // Auto-refresh if cache is empty and we have keys
      if (autoRefresh && cache.size === 0 && decryptedKeys.length > 0) {
        setRefreshing(true);
        await refreshCache();
        const newCache = await fetchCache();
        const keyInfos: KeyInfo[] = decryptedKeys.map((key, idx) => ({
          key,
          index: idx + 1,
          isCurrent: idx + 1 === currentIndex,
          usage: newCache.get(idx) || null,
        }));
        setKeys(keyInfos);
        return;
      }

      const keyInfos: KeyInfo[] = decryptedKeys.map((key, idx) => ({
        key,
        index: idx + 1,
        isCurrent: idx + 1 === currentIndex,
        usage: cache.get(idx) || null,
      }));

      setKeys(keyInfos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Listen for updates from tray menu (Electron only)
    if (isElectron) {
      const unsubscribe = window.oroio.on('keys-updated', () => {
        loadData(false, false, true);
      });
      return unsubscribe;
    }
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCache();
    await loadData(true);
  };

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    const lines = newKey.split('\n').map(l => l.trim()).filter(Boolean);
    let successCount = 0;
    let lastError = '';
    for (const key of lines) {
      const result = await addKey(key);
      if (result.success) {
        successCount++;
      } else {
        lastError = result.error || 'Failed to add key';
      }
    }
    if (successCount > 0) {
      setNewKey('');
      setAddDialogOpen(false);
      await loadData(true);
    }
    if (lastError && successCount < lines.length) {
      alert(`Added ${successCount}/${lines.length} keys. Error: ${lastError}`);
    }
    setAdding(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setNewKey(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    if (keys.length === 0) return;
    const text = keys.map(k => k.key).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'factory-keys.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveKey = (index: number) => {
    setDeleteIndex(index);
  };

  const confirmDelete = async () => {
    if (deleteIndex === null) return;
    const result = await removeKey(deleteIndex);
    if (result.success) {
      await loadData(true);
    } else {
      alert(result.error || 'Failed to remove key');
    }
    setDeleteIndex(null);
  };

  const handleUseKey = async (index: number) => {
    const result = await useKey(index);
    if (result.success) {
      sounds.switch();
      await loadData(true);
      // Check if dk is installed (Electron only)
      const dkResult = await checkDk();
      if (dkResult && !dkResult.installed) {
        if (dkResult && !dkResult.installed) {
          showDkMissingToast(dkResult.installCmd);
        }
      }
    } else {
      alert(result.error || 'Failed to switch key');
    }
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
        <Button onClick={() => loadData()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Active</span>
            <span className="text-sm font-bold font-mono text-primary">#{keys.find(k => k.isCurrent)?.index || '?'}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{keys.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Usage</span>
            <span className="text-sm font-bold font-mono text-foreground">
              {formatNumber(keys.reduce((acc, k) => acc + (k.usage?.used || 0), 0))}
              <span className="text-muted-foreground mx-0.5 text-xs">/</span>
              <span className="text-muted-foreground">{formatNumber(keys.reduce((acc, k) => acc + (k.usage?.total || 0), 0))}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing} className="h-8 w-8" title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport} disabled={keys.length === 0} className="h-8 w-8" title="Export All Keys">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs px-3">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                ADD
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inject Keys</DialogTitle>
                <DialogDescription>Enter your Factory API keys below (one per line).</DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder={"fk-xxx\nfk-yyy\nfk-zzz"}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
              <input
                type="file"
                accept=".txt"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="sm:mr-auto">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  IMPORT FROM FILE
                </Button>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>CANCEL</Button>
                <Button onClick={handleAddKey} disabled={adding || !newKey.trim()}>
                  {adding ? 'INJECTING...' : 'INJECT KEYS'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border">
        <Table className="table-fixed">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '4%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead></TableHead>
              <TableHead className="text-xs tracking-wider">NO</TableHead>
              <TableHead className="text-xs tracking-wider">KEY</TableHead>
              <TableHead className="text-xs tracking-wider">NOTE</TableHead>
              <SortableHeader field="percent" label="%" align="right" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader field="quota" label="QUOTA" align="right" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader field="expiry" label="EXPIRY" align="center" sortConfig={sortConfig} onSort={handleSort} />
              <TableHead className="text-right text-xs tracking-wider">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedKeys.map((info) => {
              const isInvalid = info.usage?.raw?.startsWith('http_') ?? false;
              const percent = info.usage?.total ? Math.round((info.usage.used || 0) / info.usage.total * 100) : 0;
              const isLow = percent >= 80 && percent < 100;
              const isZero = percent >= 100;
              const progressColor = isZero ? 'rgb(239 68 68 / 0.15)' : isLow ? 'rgb(245 158 11 / 0.15)' : 'rgb(16 185 129 / 0.15)';

              return (
                <TableRow
                  key={info.index}
                  className="transition-colors"
                  style={{
                    background: info.usage?.total
                      ? `linear-gradient(to right, ${progressColor} ${percent}%, transparent ${percent}%)`
                      : undefined
                  }}
                >
                  <TableCell className="py-2">
                    <div
                      className={cn(
                        "flex items-center justify-center w-7 h-7 cursor-pointer transition-colors",
                        info.isCurrent
                          ? "text-emerald-600 dark:text-emerald-500"
                          : "text-muted-foreground/30 hover:text-primary"
                      )}
                      onClick={() => !info.isCurrent && handleUseKey(info.index)}
                      title={info.isCurrent ? "Currently Active" : "Set as Active"}
                    >
                      {info.isCurrent ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm py-2">
                    {info.index}
                  </TableCell>
                  <TableCell className="py-2">
                    <KeyDisplay
                      keyText={info.key}
                      isCurrent={info.isCurrent}
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <NoteCell keyText={info.key} onUpdate={() => setNotesVersion(v => v + 1)} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground py-2">
                    {info.usage?.total ? `${percent}%` : '-'}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground font-mono text-right whitespace-nowrap">
                    {info.usage?.total ? (
                      <span>
                        {formatNumber(info.usage.used || 0)}
                        <span className="text-muted-foreground/50 mx-0.5">/</span>
                        {formatNumber(info.usage.total)}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap text-center">
                    {isInvalid ? (
                      <Badge variant="destructive" className="text-xs">INVALID</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{info.usage?.expires || '-'}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconCopyButton
                        text={`export FACTORY_API_KEY=${info.key}`}
                        icon={Terminal}
                        title="Copy Export Command"
                        className="h-7 w-7"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveKey(info.index)}
                        title="Delete Key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete Key #{deleteIndex} from your configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
