import { useState } from 'react';
import { Terminal, Bot, ShieldCheck, MessageSquare, Check, X, Clock } from 'lucide-react';
import { TerminalOutput } from './TerminalOutput';
import { AIChatPanel } from './AIChatPanel';
import type { LogEntry, Agent, ChecklistSummary } from '../types/api';

interface ActivityPanelProps {
  logs: LogEntry[] | null;
  logsLoading: boolean;
  agents: Agent[] | null;
  checklist: ChecklistSummary | null;
  sessionId: string;
  subscribe?: (type: string, callback: (data: unknown) => void) => () => void;
  buildMode?: 'quick' | 'standard' | 'max';
}

type TabId = 'build' | 'agents' | 'quality' | 'chat';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const TABS: TabDef[] = [
  { id: 'build', label: 'Build Log', icon: Terminal },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'quality', label: 'Quality', icon: ShieldCheck },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare },
];

function GateIcon({ status }: { status: string }) {
  switch (status) {
    case 'pass':
      return <Check size={12} className="text-success" />;
    case 'fail':
      return <X size={12} className="text-danger" />;
    default:
      return <Clock size={12} className="text-muted" />;
  }
}

function AgentsTab({ agents }: { agents: Agent[] | null }) {
  if (!agents || agents.length === 0) {
    return <div className="p-4 text-xs text-muted">No agents running.</div>;
  }
  return (
    <div className="p-2 space-y-1 overflow-y-auto terminal-scroll">
      {agents.map(agent => (
        <div
          key={agent.id}
          className="flex items-center gap-2 px-3 py-2 rounded-btn bg-hover text-xs"
        >
          <span className="font-semibold text-ink truncate">{agent.name}</span>
          <span className="text-[10px] font-mono text-muted-accessible px-1.5 py-0.5 rounded-btn bg-card">
            {agent.type}
          </span>
          <span
            className={`text-[10px] font-semibold ${
              agent.status === 'running' ? 'text-success' : 'text-muted'
            }`}
          >
            {agent.status}
          </span>
          <span className="ml-auto text-[10px] text-muted-accessible font-mono truncate max-w-[200px]">
            {agent.task}
          </span>
        </div>
      ))}
    </div>
  );
}

function QualityTab({ checklist }: { checklist: ChecklistSummary | null }) {
  if (!checklist || !checklist.items || checklist.items.length === 0) {
    return <div className="p-4 text-xs text-muted">No quality gate data available.</div>;
  }
  return (
    <div className="p-2 space-y-1 overflow-y-auto terminal-scroll">
      <div className="flex items-center gap-3 px-3 py-1 text-[10px] text-muted-accessible font-semibold uppercase">
        <span>Gate</span>
        <span className="ml-auto">
          {checklist.passed}/{checklist.total} passed
        </span>
      </div>
      {checklist.items.map(item => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-btn hover:bg-hover text-xs"
        >
          <GateIcon status={item.status} />
          <span className="text-ink">{item.label}</span>
          {item.details && (
            <span className="ml-auto text-[10px] text-muted-accessible truncate max-w-[200px]">
              {item.details}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActivityPanel({
  logs,
  logsLoading,
  agents,
  checklist,
  sessionId,
  subscribe,
  buildMode,
}: ActivityPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('build');

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Tab bar */}
      <div
        role="tablist"
        className="flex items-center border-b border-border px-2 flex-shrink-0"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel" aria-label={TABS.find(t => t.id === activeTab)?.label} className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'build' && (
          <TerminalOutput logs={logs} loading={logsLoading} subscribe={subscribe} />
        )}
        {activeTab === 'agents' && <AgentsTab agents={agents} />}
        {activeTab === 'quality' && <QualityTab checklist={checklist} />}
        {activeTab === 'chat' && <AIChatPanel sessionId={sessionId} defaultMode={buildMode} />}
      </div>
    </div>
  );
}
