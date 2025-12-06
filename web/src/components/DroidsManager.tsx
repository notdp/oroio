import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, FileText, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { isElectron, listDroids, createDroid, deleteDroid, type Droid } from '@/utils/api';

export default function DroidsManager() {
  const [droids, setDroids] = useState<Droid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [droidToDelete, setDroidToDelete] = useState<string | null>(null);
  const [newDroidName, setNewDroidName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadDroids = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listDroids();
      setDroids(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load droids');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDroids();
  }, [loadDroids]);

  const handleAddDroid = async () => {
    if (!newDroidName.trim()) return;
    setAdding(true);
    try {
      await createDroid(newDroidName.trim());
      setNewDroidName('');
      setAddDialogOpen(false);
      await loadDroids();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create droid');
    }
    setAdding(false);
  };

  const handleDeleteDroid = async () => {
    if (!droidToDelete) return;
    try {
      await deleteDroid(droidToDelete);
      await loadDroids();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete droid');
    }
    setDroidToDelete(null);
  };

  const handleOpenDroid = async (droidPath: string) => {
    if (isElectron) {
      await window.oroio.openPath(droidPath);
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
        <Button onClick={loadDroids}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{droids.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Status</span>
            <span className="text-sm font-bold font-mono text-muted-foreground">IDLE</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Mode</span>
            <span className="text-sm font-bold font-mono text-foreground">YAML</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="icon" onClick={loadDroids} className="h-8 w-8" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs px-3">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                NEW
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Droid</DialogTitle>
                <DialogDescription>Enter a name for your new droid configuration.</DialogDescription>
              </DialogHeader>
              <Input
                placeholder="my-droid"
                value={newDroidName}
                onChange={(e) => setNewDroidName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDroid()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddDroid} disabled={adding || !newDroidName.trim()}>
                  {adding ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border">
        {droids.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bot className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No droids found</p>
            <p className="text-xs text-muted-foreground/70">~/.factory/droids/</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-[10px] tracking-wider">NAME</TableHead>
                <TableHead className="text-[10px] tracking-wider">PATH</TableHead>
                <TableHead className="w-[90px] text-right text-[10px] tracking-wider">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {droids.map((droid) => (
                <TableRow key={droid.name}>
                  <TableCell className="font-medium text-sm py-2">{droid.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs py-2">{droid.path}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenDroid(droid.path)}
                        title="Open in Editor"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDroidToDelete(droid.name)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={droidToDelete !== null} onOpenChange={(open) => !open && setDroidToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete droid "{droidToDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the droid configuration file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDroid} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
