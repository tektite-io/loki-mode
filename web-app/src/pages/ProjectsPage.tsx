import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { SessionHistoryItem } from '../api/client';

type FilterTab = 'all' | 'running' | 'completed' | 'failed';

function statusToBadge(status: string): 'completed' | 'running' | 'failed' | 'started' | 'empty' {
  const normalized = normalizeStatus(status);
  if (normalized === 'completed') return 'completed';
  if (normalized === 'running') return 'running';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'started') return 'started';
  return 'empty';
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  complete: 'Completed',
  done: 'Completed',
  completion_promise_fulfilled: 'Completed',
  running: 'Running',
  in_progress: 'Running',
  planning: 'Planning',
  started: 'Started',
  error: 'Failed',
  failed: 'Failed',
  empty: 'Empty',
};

function normalizeStatus(s: string): string {
  const map: Record<string, string> = {
    completion_promise_fulfilled: 'completed',
    complete: 'completed',
    done: 'completed',
    in_progress: 'running',
    planning: 'running',
    error: 'failed',
  };
  return map[s] || s;
}

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  const fetchSessions = useCallback(() => api.getSessionsHistory(), []);
  const { data: sessions } = usePolling(fetchSessions, 15000, true);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    let list = sessions;
    if (filter !== 'all') {
      list = list.filter((s) => s.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.prd_snippet.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, filter, search]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-h1 text-[#36342E]">Projects</h1>
        <Button icon={Plus} onClick={() => navigate('/')}>
          New Project
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6960]" />
          <input
            type="text"
            placeholder="Search projects..."
            aria-label="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#ECEAE3] rounded-[5px] bg-white text-[#36342E] placeholder:text-[#939084] focus:outline-none focus:ring-2 focus:ring-[#553DE9]/20 focus:border-[#553DE9]"
          />
        </div>
        <div className="flex items-center gap-1" role="tablist">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={filter === tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-colors ${
                filter === tab.key
                  ? 'bg-[#553DE9] text-white'
                  : 'text-[#6B6960] hover:text-[#36342E] hover:bg-[#F8F4F0]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-[#6B6960] text-sm mb-4">No projects yet. Start building.</p>
          <Button icon={Plus} onClick={() => navigate('/')}>
            New Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => (
            <ProjectCard
              key={session.id}
              session={session}
              onClick={() => navigate(`/project/${session.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  session,
  onClick,
}: {
  session: SessionHistoryItem;
  onClick: () => void;
}) {
  const dateStr = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card hover onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#6B6960]">{dateStr}</span>
        <Badge status={statusToBadge(session.status)}>{STATUS_LABELS[session.status] || session.status}</Badge>
      </div>
      <h3 className="text-sm font-medium text-[#36342E] line-clamp-2 mb-2">
        {session.prd_snippet || 'Untitled project'}
      </h3>
      <p className="text-xs text-[#6B6960] truncate">{session.path}</p>
    </Card>
  );
}
