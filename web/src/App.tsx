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
        <header className="border-b border-border pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                <span className="font-pixel text-lg tracking-tighter mt-1 text-primary leading-none">OROIO</span>
              </h1>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground mr-4 border-r border-border pr-4 h-full">

                <button
                  className={cn(
                    "flex items-center gap-2",
                    dkMissing && "cursor-pointer hover:opacity-80 transition-opacity"
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
                    "w-2 h-2 rounded-full animate-pulse",
                    dkMissing ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                  <span className={cn(
                    dkMissing && "text-amber-500 font-bold"
                  )}>
                    {dkMissing ? "STATUS: DK MISSING" : "STATUS: CONNECTED"}
                  </span>
                </button>
              </div>

              <div className="flex items-center border border-border select-none bg-background">
                <button
                  onClick={() => { sound.toggleSound(); setTheme('light'); }}
                  className={cn(
                    "px-3 py-1 transition-all hover:text-foreground text-[10px] tracking-wider font-medium",
                    theme === 'light'
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  LIGHT
                </button>
                <div className="w-[1px] h-3 bg-border" />
                <button
                  onClick={() => { sound.toggleSound(); setTheme('dark'); }}
                  className={cn(
                    "px-3 py-1 transition-all hover:text-foreground text-[10px] tracking-wider font-medium",
                    theme === 'dark'
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  DARK
                </button>
              </div>

              <a
                href="https://github.com/notdp/oroio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1 border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all text-[10px] tracking-wider font-medium"
                title="View Source on GitHub"
              >
                <Github className="w-3 h-3" />
                <span>GITHUB</span>
              </a>

              <button
                onClick={() => sound.toggle()}
                className="flex items-center gap-2 px-3 py-1 border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all text-[10px] tracking-wider font-medium"
                title={sound.muted ? "Unmute sounds" : "Mute sounds"}
              >
                {sound.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                <span>{sound.muted ? 'MUTED' : 'SOUND'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        {/* Navigation */}
        <nav className="flex items-center justify-between w-full">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {tabs.map(({ id, label }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => { sound.click(); setActiveTab(id); }}
                  className={cn(
                    "group relative px-2 py-1 transition-all duration-200 outline-none focus:ring-1 focus:ring-primary",
                    isActive
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="mr-1 opacity-100 transition-opacity">
                    {isActive ? '[' : '\u00A0'}
                  </span>
                  {label}
                  <span className="ml-1 opacity-100 transition-opacity">
                    {isActive ? ']' : '\u00A0'}
                  </span>

                  {/* Hover effect for non-active */}
                  {!isActive && (
                    <span className="absolute inset-0 border border-transparent group-hover:border-dashed group-hover:border-muted-foreground/50 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground opacity-50 hover:opacity-100 transition-opacity">
            <span className="tracking-wider text-[10px]">NAVIGATE</span>
            <Kbd className="text-[10px] min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-background border border-border shadow-sm">Tab</Kbd>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="border border-border p-6 min-h-[600px] relative">
          {activeTab === 'keys' && <KeyList />}
          {activeTab === 'commands' && <CommandsManager />}
          {activeTab === 'skills' && <SkillsManager />}
          {activeTab === 'droids' && <DroidsManager />}
          {activeTab === 'mcp' && <McpManager />}
        </main>

        {/* Footer */}
        <footer className="text-xs text-muted-foreground border-t border-border pt-4 flex justify-between items-center">
          <div>
            Running process: PID {fakePid}
          </div>
          <div>
            MEM usage: {fakeMemory}MB
          </div>
        </footer>
      </div>
    </div>
  );
}
