import { useState, useEffect, useCallback } from 'react';
import { Key, Sparkles, Terminal, Bot, Plug, Github, Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { Toaster } from 'sonner';
import KeyList, { showDkMissingToast } from '@/components/KeyList';
import SkillsManager from '@/components/SkillsManager';
import CommandsManager from '@/components/CommandsManager';
import DroidsManager from '@/components/DroidsManager';
import McpManager from '@/components/McpManager';
import PinDialog from '@/components/PinDialog';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';
import { checkAuth, authenticate, isElectron, checkDk } from '@/utils/api';

type Tab = 'keys' | 'commands' | 'skills' | 'droids' | 'mcp';

const tabs: { id: Tab; label: string; icon: typeof Key }[] = [
  { id: 'keys', label: 'KEYS', icon: Key },
  { id: 'commands', label: 'COMMANDS', icon: Terminal },
  { id: 'skills', label: 'SKILLS', icon: Sparkles },
  { id: 'droids', label: 'SUB_AGENTS', icon: Bot },
  { id: 'mcp', label: 'MCP_SERVERS', icon: Plug },
];

export default function App() {
  const sound = useSound();
  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('oroio-theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });
  const [fakePid] = useState(() => Math.floor(Math.random() * 9000) + 1000);
  const [fakeMemory] = useState(() => Math.floor(Math.random() * 50) + 20);

  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [dkMissing, setDkMissing] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const initChecks = async () => {
      if (isElectron) {
        setAuthenticated(true);
        setAuthChecking(false);
        // Check DK status
        try {
          const dkResult = await checkDk();
          if (dkResult && !dkResult.installed) {
            setDkMissing(true);
          }
        } catch (e) {
          console.error("Failed to check DK status", e);
        }
        return;
      }

      try {
        const result = await checkAuth();
        setAuthRequired(result.required);
        setAuthenticated(result.authenticated);
      } catch {
        setAuthenticated(true);
      } finally {
        setAuthChecking(false);
      }
    };
    initChecks();
  }, []);

  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    setAuthError(undefined);
    const result = await authenticate(pin);
    if (result.success) {
      setAuthenticated(true);
      return true;
    }
    setAuthError(result.error || 'Invalid PIN');
    return false;
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      sound.click();
      setActiveTab(prev => {
        const currentIndex = tabs.findIndex(t => t.id === prev);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        return tabs[nextIndex].id;
      });
    }
  }, [sound]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('oroio-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted || authChecking) return null;

  // Show PIN dialog if auth is required but not authenticated
  if (authRequired && !authenticated) {
    return <PinDialog onSubmit={handlePinSubmit} error={authError} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-mono p-4 md:p-8 selection:bg-primary selection:text-primary-foreground relative overflow-hidden transition-colors duration-300">
      <Toaster position="bottom-center" theme={theme} richColors />
      <div className="scanline" />
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">

        {/* Header Section */}
        <header className="border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                <span className="font-pixel text-base tracking-tighter mt-0.5 text-primary leading-none">OROIO</span>
              </h1>
              <button
                className={cn(
                  "flex items-center gap-2 text-xs px-2.5 py-1 border border-border bg-card",
                  dkMissing && "cursor-pointer hover:bg-muted transition-colors border-amber-500/30"
                )}
                onClick={async () => {
                  if (dkMissing && isElectron) {
                    const result = await checkDk();
                    if (result && !result.installed) {
                      showDkMissingToast(result.installCmd);
                    }
                  }
                }}
                disabled={!dkMissing}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  dkMissing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                )} />
                <span className={cn(
                  "text-[10px] tracking-wider",
                  dkMissing ? "text-amber-500" : "text-muted-foreground"
                )}>
                  {dkMissing ? "DK_MISSING" : "CONNECTED"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center border border-border select-none bg-card">
                <button
                  onClick={() => { sound.toggleSound(); setTheme('light'); }}
                  className={cn(
                    "px-2.5 py-1.5 transition-all text-[10px] tracking-wider font-medium",
                    theme === 'light'
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  LIGHT
                </button>
                <button
                  onClick={() => { sound.toggleSound(); setTheme('dark'); }}
                  className={cn(
                    "px-2.5 py-1.5 transition-all text-[10px] tracking-wider font-medium",
                    theme === 'dark'
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  DARK
                </button>
              </div>

              <a
                href="https://github.com/notdp/oroio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="View Source on GitHub"
              >
                <Github className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={() => sound.toggle()}
                className="flex items-center justify-center w-8 h-8 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title={sound.muted ? "Unmute sounds" : "Mute sounds"}
              >
                {sound.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="flex items-center justify-between w-full">
          <div className="flex items-center gap-0.5 text-sm border border-border bg-card p-1">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => { sound.click(); setActiveTab(id); }}
                  className={cn(
                    "relative px-3 py-1.5 transition-all duration-150 outline-none flex items-center gap-2 text-xs tracking-wide",
                    isActive
                      ? "text-primary-foreground bg-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <span className="tracking-wider text-[10px]">NAVIGATE</span>
            <Kbd className="text-[10px] min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-card border border-border">Tab</Kbd>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="border border-border bg-card p-6 min-h-[500px] relative">
          {activeTab === 'keys' && <KeyList />}
          {activeTab === 'commands' && <CommandsManager />}
          {activeTab === 'skills' && <SkillsManager />}
          {activeTab === 'droids' && <DroidsManager />}
          {activeTab === 'mcp' && <McpManager />}
        </main>

        {/* Footer */}
        <footer className="text-[10px] text-muted-foreground/50 pt-3 flex justify-between items-center tracking-wider">
          <span>PID:{fakePid}</span>
          <span>MEM:{fakeMemory}MB</span>
        </footer>
      </div>
    </div>
  );
}
