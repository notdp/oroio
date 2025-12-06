import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, FileText, FolderOpen, Sparkles } from 'lucide-react';
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
import { isElectron, listSkills, createSkill, deleteSkill, type Skill } from '@/utils/api';

export default function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listSkills();
      setSkills(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleAddSkill = async () => {
    if (!newSkillName.trim()) return;
    setAdding(true);
    try {
      await createSkill(newSkillName.trim());
      setNewSkillName('');
      setAddDialogOpen(false);
      await loadSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create skill');
    }
    setAdding(false);
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    try {
      await deleteSkill(skillToDelete);
      await loadSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete skill');
    }
    setSkillToDelete(null);
  };

  const handleOpenSkill = async (skillPath: string) => {
    if (isElectron) {
      await window.oroio.openPath(skillPath);
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
        <Button onClick={loadSkills}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{skills.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Format</span>
            <span className="text-sm font-bold font-mono text-primary">.MD</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Expand</span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-500">AUTO</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="icon" onClick={loadSkills} className="h-8 w-8" title="Refresh">
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
                <DialogTitle>Create New Skill</DialogTitle>
                <DialogDescription>Enter a name for your new skill. A SKILL.md file will be created.</DialogDescription>
              </DialogHeader>
              <Input
                placeholder="my-skill"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddSkill} disabled={adding || !newSkillName.trim()}>
                  {adding ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Sparkles className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No skills found</p>
            <p className="text-xs text-muted-foreground/70">.factory/skills/[name]/SKILL.md</p>
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
              {skills.map((skill) => (
                <TableRow key={skill.name}>
                  <TableCell className="font-medium text-sm py-2">{skill.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs py-2">{skill.path}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenSkill(skill.path)}
                        title="Open in Editor"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenSkill(skill.path.replace('/SKILL.md', ''))}
                        title="Open Folder"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setSkillToDelete(skill.name)}
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

      <AlertDialog open={skillToDelete !== null} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill "{skillToDelete}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the skill folder and all its contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSkill} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
