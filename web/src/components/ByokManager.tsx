import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Cpu, Copy, Check, Pencil, ChevronRight, ChevronDown, Eye, EyeOff, Brain, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { listCustomModels, removeCustomModel, updateCustomModel, type CustomModel } from '@/utils/api';
import { toast } from 'sonner';

function showError(message: string) {
  toast.custom((t) => (
    <div className="flex flex-col w-[320px] bg-card border border-border shadow-xl relative overflow-hidden font-mono">
      <div className="flex gap-3 p-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-destructive/10 rounded blur-sm" />
          <div className="relative flex items-center justify-center w-8 h-8 bg-card border border-destructive/20 text-destructive rounded shadow-sm">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-bold text-foreground tracking-wide">ERROR</p>
            <button
              onClick={() => toast.dismiss(t)}
              className="text-muted-foreground/70 hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="h-0.5 bg-muted w-full">
        <div
          className="h-full bg-destructive animate-shrink-width"
          onAnimationEnd={() => toast.dismiss(t)}
        />
      </div>
    </div>
  ), { duration: 4000 });
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'generic-chat-completion-api', label: 'Generic' },
];

const THINKING_LEVELS = [
  { value: 'none', label: 'None', tokens: 0 },
  { value: 'low', label: 'Low', tokens: 1024 },
  { value: 'medium', label: 'Medium', tokens: 8192 },
  { value: 'high', label: 'High', tokens: 24576 },
  { value: 'xhigh', label: 'X-High', tokens: 32768 },
];

const SUMMARY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'concise', label: 'Concise' },
];

interface FormState {
  model_display_name: string;
  model: string;
  base_url: string;
  api_key: string;
  provider: string;
  max_tokens: string;
  supports_images: boolean;
  thinking_enabled: boolean;
  thinking_level: string;
  thinking_summary: string;
}

const DEFAULT_FORM: FormState = {
  model_display_name: '',
  model: '',
  base_url: '',
  api_key: '',
  provider: 'openai',
  max_tokens: '',
  supports_images: false,
  thinking_enabled: false,
  thinking_level: 'high',
  thinking_summary: 'detailed',
};

function parseModelToForm(model: CustomModel): FormState {
  const form: FormState = {
    model_display_name: model.model_display_name || '',
    model: model.model,
    base_url: model.base_url,
    api_key: model.api_key,
    provider: model.provider,
    max_tokens: model.max_tokens?.toString() || '',
    supports_images: model.supports_images || false,
    thinking_enabled: false,
    thinking_level: 'high',
    thinking_summary: 'detailed',
  };

  const extraArgs = model.extra_args as Record<string, unknown> | undefined;
  if (extraArgs) {
    if (model.provider === 'openai' && extraArgs.reasoning) {
      const reasoning = extraArgs.reasoning as { effort?: string; summary?: string };
      form.thinking_enabled = reasoning.effort !== 'none' && !!reasoning.effort;
      form.thinking_level = reasoning.effort || 'high';
      form.thinking_summary = reasoning.summary || 'detailed';
    } else if (model.provider === 'anthropic' && extraArgs.thinking) {
      const thinking = extraArgs.thinking as { type?: string; budget_tokens?: number };
      form.thinking_enabled = thinking.type === 'enabled';
      const tokens = thinking.budget_tokens || 0;
      const level = THINKING_LEVELS.find(l => l.tokens === tokens) || 
                    THINKING_LEVELS.find(l => l.tokens <= tokens && tokens < (THINKING_LEVELS[THINKING_LEVELS.indexOf(l) + 1]?.tokens || Infinity));
      form.thinking_level = level?.value || 'high';
    }
  }

  return form;
}

function formToModel(form: FormState): CustomModel {
  const model: CustomModel = {
    model: form.model,
    base_url: form.base_url,
    api_key: form.api_key,
    provider: form.provider as CustomModel['provider'],
  };

  if (form.model_display_name) {
    model.model_display_name = form.model_display_name;
  }
  if (form.max_tokens) {
    model.max_tokens = parseInt(form.max_tokens, 10);
  }
  if (form.supports_images) {
    model.supports_images = true;
  }

  if (form.thinking_enabled && form.provider !== 'generic-chat-completion-api') {
    if (form.provider === 'openai') {
      model.extra_args = {
        reasoning: {
          effort: form.thinking_level,
          summary: form.thinking_summary,
        },
      };
    } else if (form.provider === 'anthropic') {
      const level = THINKING_LEVELS.find(l => l.value === form.thinking_level);
      model.extra_args = {
        thinking: {
          type: 'enabled',
          budget_tokens: level?.tokens || 24576,
        },
      };
      if (!model.max_tokens) {
        model.max_tokens = 64000;
      }
    }
  }

  return model;
}

export default function ByokManager() {
  const [models, setModels] = useState<CustomModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedModel, setExpandedModel] = useState<number | null>(null);
  const [copiedModel, setCopiedModel] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<number | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Set<number>>(new Set());
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listCustomModels();
      setModels(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load custom models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const getModelConfig = (model: CustomModel) => {
    return JSON.stringify(model, null, 2);
  };

  const getMaskedConfig = (model: CustomModel) => {
    const masked = { ...model, api_key: '***' + model.api_key.slice(-4) };
    return JSON.stringify(masked, null, 2);
  };

  const handleCopy = async (model: CustomModel, index: number) => {
    await navigator.clipboard.writeText(getModelConfig(model));
    setCopiedModel(index);
    setTimeout(() => setCopiedModel(null), 2000);
  };

  const handleCopyAll = async () => {
    if (models.length === 0) return;
    const allConfigs = JSON.stringify({ custom_models: models }, null, 2);
    await navigator.clipboard.writeText(allConfigs);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const openAddDialog = () => {
    setForm(DEFAULT_FORM);
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const openEditDialog = (model: CustomModel, index: number) => {
    setForm(parseModelToForm(model));
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.model || !form.base_url || !form.api_key || !form.provider) {
      showError('Please fill in all required fields');
      return;
    }
    try {
      const model = formToModel(form);
      await updateCustomModel(editingIndex ?? -1, model);
      setDialogOpen(false);
      await loadModels();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (modelToDelete === null) return;
    try {
      await removeCustomModel(modelToDelete);
      await loadModels();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove');
    }
    setModelToDelete(null);
  };

  const toggleApiKeyVisibility = (index: number) => {
    setShowApiKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getProviderLabel = (provider: string) => {
    const option = PROVIDER_OPTIONS.find(p => p.value === provider);
    return option ? option.label : provider;
  };

  const hasThinking = (model: CustomModel) => {
    const extraArgs = model.extra_args as Record<string, unknown> | undefined;
    if (!extraArgs) return false;
    if (model.provider === 'openai' && extraArgs.reasoning) {
      const r = extraArgs.reasoning as { effort?: string };
      return r.effort && r.effort !== 'none';
    }
    if (model.provider === 'anthropic' && extraArgs.thinking) {
      const t = extraArgs.thinking as { type?: string };
      return t.type === 'enabled';
    }
    return false;
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
        <Button onClick={loadModels}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold font-mono text-primary">{models.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Anthropic</span>
            <span className="text-sm font-bold font-mono text-primary">{models.filter(m => m.provider === 'anthropic').length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">OpenAI</span>
            <span className="text-sm font-bold font-mono text-foreground">{models.filter(m => m.provider === 'openai').length.toString().padStart(2, '0')}</span>
          </div>
          <div className="px-3 py-1.5 border border-border bg-card flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Generic</span>
            <span className="text-sm font-bold font-mono text-foreground">{models.filter(m => m.provider === 'generic-chat-completion-api').length.toString().padStart(2, '0')}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {models.length > 0 && (
            <Button variant="outline" size="icon" onClick={handleCopyAll} className="h-8 w-8" title="Copy all configs">
              {copiedAll ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={loadModels} className="h-8 w-8" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-8 text-xs px-3" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            ADD
          </Button>
        </div>
      </div>

      <div className="border border-border">
        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Cpu className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No custom models configured</p>
            <p className="text-xs text-muted-foreground/70">~/.factory/config.json</p>
          </div>
        ) : (
          <div className="divide-y">
            {models.map((model, index) => {
              const isExpanded = expandedModel === index;
              const showKey = showApiKeys.has(index);
              return (
                <div key={index} className="group">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedModel(isExpanded ? null : index)}
                  >
                    <div className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.model_display_name || model.model}</span>
                        <Badge variant={model.provider === 'anthropic' ? 'default' : model.provider === 'openai' ? 'secondary' : 'outline'} className="text-xs">
                          {getProviderLabel(model.provider)}
                        </Badge>
                        {hasThinking(model) && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Brain className="h-3 w-3" />
                            Thinking
                          </Badge>
                        )}
                        {model.supports_images && (
                          <Badge variant="outline" className="text-xs">Vision</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {model.base_url}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleApiKeyVisibility(index)}
                        title={showKey ? "Hide API key" : "Show API key"}
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(model, index)}
                        title="Copy config"
                      >
                        {copiedModel === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(model, index)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setModelToDelete(index)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pl-11">
                      <pre className="text-sm bg-muted/50 rounded-md p-3 overflow-x-auto">
                        <code>{showKey ? getModelConfig(model) : getMaskedConfig(model)}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? 'Edit Model' : 'Add Custom Model'}</DialogTitle>
            <DialogDescription>Configure your BYOK model settings.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                placeholder="My Custom Model"
                value={form.model_display_name}
                onChange={(e) => setForm({ ...form, model_display_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                placeholder="gpt-5.2 or claude-opus-4-5-20251101"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_url">Base URL *</Label>
              <Input
                id="base_url"
                placeholder="http://localhost:8317/v1"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key">API Key *</Label>
              <Input
                id="api_key"
                type="password"
                placeholder="sk-..."
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider *</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_tokens">Max Tokens</Label>
              <Input
                id="max_tokens"
                type="number"
                placeholder="4096"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="supports_images">Supports Images</Label>
              <Switch
                id="supports_images"
                checked={form.supports_images}
                onCheckedChange={(checked) => setForm({ ...form, supports_images: checked })}
              />
            </div>

            {form.provider !== 'generic-chat-completion-api' && (
              <>
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="thinking_enabled">Enable Thinking</Label>
                    </div>
                    <Switch
                      id="thinking_enabled"
                      checked={form.thinking_enabled}
                      onCheckedChange={(checked) => setForm({ ...form, thinking_enabled: checked })}
                    />
                  </div>

                  {form.thinking_enabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-muted">
                      <div className="space-y-2">
                        <Label>Thinking Level</Label>
                        <Select value={form.thinking_level} onValueChange={(v) => setForm({ ...form, thinking_level: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {THINKING_LEVELS.filter(l => l.value !== 'none').map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label} {form.provider === 'anthropic' && `(${opt.tokens.toLocaleString()} tokens)`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {form.provider === 'openai' && (
                        <div className="space-y-2">
                          <Label>Summary</Label>
                          <Select value={form.thinking_summary} onValueChange={(v) => setForm({ ...form, thinking_summary: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUMMARY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingIndex !== null ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={modelToDelete !== null} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this model?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom model from config.json.
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
