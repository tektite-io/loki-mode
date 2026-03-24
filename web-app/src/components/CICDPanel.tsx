import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  ChevronDown,
  ChevronRight,
  Terminal,
  Rocket,
  TestTube2,
  Package,
  RefreshCw,
} from 'lucide-react';
import { Button } from './ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface PipelineStage {
  id: string;
  name: string;
  status: PipelineStageStatus;
  duration?: string;
  logs?: string[];
  startedAt?: string;
}

export interface PipelineRun {
  id: string;
  name: string;
  branch: string;
  commit: string;
  commitMessage: string;
  status: PipelineStageStatus;
  stages: PipelineStage[];
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
}

interface CICDPanelProps {
  sessionId?: string;
  onTriggerPipeline?: () => void;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const stageIcons: Record<string, typeof Package> = {
  Build: Package,
  Test: TestTube2,
  Deploy: Rocket,
};

const statusStyles: Record<PipelineStageStatus, {
  color: string;
  bg: string;
  Icon: typeof CheckCircle;
  label: string;
}> = {
  pending: {
    color: 'text-[#939084]',
    bg: 'bg-[#939084]/10',
    Icon: Clock,
    label: 'Pending',
  },
  running: {
    color: 'text-[#553DE9]',
    bg: 'bg-[#553DE9]/10',
    Icon: Loader,
    label: 'Running',
  },
  success: {
    color: 'text-[#1FC5A8]',
    bg: 'bg-[#1FC5A8]/10',
    Icon: CheckCircle,
    label: 'Success',
  },
  failed: {
    color: 'text-[#C45B5B]',
    bg: 'bg-[#C45B5B]/10',
    Icon: XCircle,
    label: 'Failed',
  },
  skipped: {
    color: 'text-[#939084]',
    bg: 'bg-[#939084]/10',
    Icon: Clock,
    label: 'Skipped',
  },
};

function StatusBadge({ status }: { status: PipelineStageStatus }) {
  const style = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.color}`}>
      <style.Icon size={12} className={status === 'running' ? 'animate-spin' : ''} />
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stage log viewer
// ---------------------------------------------------------------------------

function StageLogViewer({ stage }: { stage: PipelineStage }) {
  const [expanded, setExpanded] = useState(false);
  const StageIcon = stageIcons[stage.name] || Terminal;

  return (
    <div className="border border-[#ECEAE3] dark:border-[#2A2A30] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8F4F0] dark:hover:bg-[#222228] transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-[#939084]" />
        ) : (
          <ChevronRight size={14} className="text-[#939084]" />
        )}
        <StageIcon size={16} className={statusStyles[stage.status].color} />
        <span className="text-sm font-medium text-[#201515] dark:text-[#E8E6E3] flex-1">
          {stage.name}
        </span>
        {stage.duration && (
          <span className="text-xs text-[#939084] font-mono">{stage.duration}</span>
        )}
        <StatusBadge status={stage.status} />
      </button>

      {expanded && (
        <div className="border-t border-[#ECEAE3] dark:border-[#2A2A30] bg-[#0F0F11] text-[#E8E6E3] p-3 max-h-64 overflow-y-auto terminal-scroll">
          {stage.logs && stage.logs.length > 0 ? (
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
              {stage.logs.join('\n')}
            </pre>
          ) : (
            <p className="text-xs text-[#939084] font-mono">No logs available</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline run card
// ---------------------------------------------------------------------------

function PipelineRunCard({ run }: { run: PipelineRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[#ECEAE3] dark:border-[#2A2A30] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8F4F0] dark:hover:bg-[#222228] transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-[#939084]" />
        ) : (
          <ChevronRight size={14} className="text-[#939084]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#201515] dark:text-[#E8E6E3]">
              {run.name}
            </span>
            <StatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1 text-xs text-[#939084]">
              <GitBranch size={12} />
              {run.branch}
            </span>
            <span className="text-xs text-[#939084] font-mono truncate max-w-[200px]">
              {run.commit.substring(0, 7)} - {run.commitMessage}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-[#939084]">by {run.triggeredBy}</p>
          <p className="text-xs text-[#939084] font-mono">{run.startedAt}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#ECEAE3] dark:border-[#2A2A30] space-y-2 pt-3">
          {/* Pipeline progress visualization */}
          <div className="flex items-center gap-1 mb-3">
            {run.stages.map((stage, i) => (
              <div key={stage.id} className="flex items-center flex-1">
                <div
                  className={`flex-1 h-1.5 rounded-full ${statusStyles[stage.status].bg}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stage.status === 'success' ? 'bg-[#1FC5A8]' :
                      stage.status === 'running' ? 'bg-[#553DE9] animate-pulse' :
                      stage.status === 'failed' ? 'bg-[#C45B5B]' :
                      'bg-[#939084]/30'
                    }`}
                    style={{
                      width: stage.status === 'pending' ? '0%' :
                             stage.status === 'running' ? '50%' : '100%',
                    }}
                  />
                </div>
                {i < run.stages.length - 1 && (
                  <div className="w-4 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-[#ECEAE3] dark:bg-[#2A2A30]" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {run.stages.map(stage => (
            <StageLogViewer key={stage.id} stage={stage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function getSamplePipelines(): PipelineRun[] {
  return [
    {
      id: 'run-1',
      name: 'CI Pipeline',
      branch: 'main',
      commit: 'a1b2c3d4',
      commitMessage: 'Add notification system',
      status: 'success',
      triggeredBy: 'developer',
      startedAt: new Date(Date.now() - 600000).toLocaleString(),
      finishedAt: new Date(Date.now() - 300000).toLocaleString(),
      stages: [
        {
          id: 'build-1',
          name: 'Build',
          status: 'success',
          duration: '1m 23s',
          logs: [
            '> npm ci',
            'added 1247 packages in 45s',
            '> npm run build',
            'vite v5.4.0 building for production...',
            'transforming (342) src/main.tsx',
            'build completed in 38s',
            'dist/index.html    0.46 kB | gzip:  0.30 kB',
            'dist/assets/index-DiwrgTda.css  45.21 kB | gzip: 8.91 kB',
            'dist/assets/index-BqWFE2Nh.js  285.39 kB | gzip: 91.22 kB',
            'BUILD SUCCESSFUL',
          ],
        },
        {
          id: 'test-1',
          name: 'Test',
          status: 'success',
          duration: '2m 10s',
          logs: [
            '> npm test',
            'PASS src/components/NotificationSystem.test.tsx',
            'PASS src/components/TeamPanel.test.tsx',
            'PASS src/components/RBACPanel.test.tsx',
            '',
            'Test Suites: 12 passed, 12 total',
            'Tests:       48 passed, 48 total',
            'Time:        2.1s',
            'ALL TESTS PASSED',
          ],
        },
        {
          id: 'deploy-1',
          name: 'Deploy',
          status: 'success',
          duration: '45s',
          logs: [
            'Deploying to production...',
            'Uploading build artifacts...',
            'Updating service configuration...',
            'Health check: OK',
            'DEPLOY SUCCESSFUL',
          ],
        },
      ],
    },
    {
      id: 'run-2',
      name: 'CI Pipeline',
      branch: 'feature/auth',
      commit: 'e5f6g7h8',
      commitMessage: 'Fix login redirect',
      status: 'failed',
      triggeredBy: 'developer',
      startedAt: new Date(Date.now() - 3600000).toLocaleString(),
      stages: [
        { id: 'build-2', name: 'Build', status: 'success', duration: '1m 15s', logs: ['BUILD SUCCESSFUL'] },
        {
          id: 'test-2',
          name: 'Test',
          status: 'failed',
          duration: '1m 45s',
          logs: [
            '> npm test',
            'PASS src/components/NotificationSystem.test.tsx',
            'FAIL src/hooks/useAuth.test.tsx',
            '  - should redirect to login on 401 (assertion error)',
            '  Expected: "/login"',
            '  Received: "/"',
            '',
            'Test Suites: 1 failed, 11 passed, 12 total',
            'Tests:       1 failed, 47 passed, 48 total',
            'TEST FAILED',
          ],
        },
        { id: 'deploy-2', name: 'Deploy', status: 'skipped', logs: ['Skipped due to test failure'] },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Main CI/CD Panel
// ---------------------------------------------------------------------------

export function CICDPanel({ sessionId, onTriggerPipeline }: CICDPanelProps) {
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPipelines = useCallback(() => {
    setLoading(true);
    // In production, this would fetch from the API
    setTimeout(() => {
      setPipelines(getSamplePipelines());
      setLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines, sessionId]);

  const handleTrigger = () => {
    if (onTriggerPipeline) {
      onTriggerPipeline();
    }
    // Add a "running" pipeline at the top
    const newRun: PipelineRun = {
      id: `run-${Date.now()}`,
      name: 'CI Pipeline',
      branch: 'main',
      commit: Math.random().toString(36).substring(2, 10),
      commitMessage: 'Manual trigger',
      status: 'running',
      triggeredBy: 'manual',
      startedAt: new Date().toLocaleString(),
      stages: [
        { id: `build-${Date.now()}`, name: 'Build', status: 'running', logs: ['Starting build...'] },
        { id: `test-${Date.now()}`, name: 'Test', status: 'pending', logs: [] },
        { id: `deploy-${Date.now()}`, name: 'Deploy', status: 'pending', logs: [] },
      ],
    };
    setPipelines(prev => [newRun, ...prev]);
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-[#553DE9]" />
          <h3 className="text-sm font-semibold text-[#201515] dark:text-[#E8E6E3] uppercase tracking-wider">
            CI/CD Pipelines
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={loadPipelines}>
            Refresh
          </Button>
          <Button size="sm" icon={Play} onClick={handleTrigger}>
            Trigger Pipeline
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && pipelines.length > 0 && (
        <div className="flex items-center gap-4 mb-4 text-xs">
          <span className="flex items-center gap-1 text-[#1FC5A8]">
            <CheckCircle size={12} />
            {pipelines.filter(p => p.status === 'success').length} passed
          </span>
          <span className="flex items-center gap-1 text-[#C45B5B]">
            <XCircle size={12} />
            {pipelines.filter(p => p.status === 'failed').length} failed
          </span>
          <span className="flex items-center gap-1 text-[#553DE9]">
            <Loader size={12} />
            {pipelines.filter(p => p.status === 'running').length} running
          </span>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-[#939084] text-sm">Loading pipelines...</div>
      )}

      {!loading && pipelines.length === 0 && (
        <div className="text-center py-8">
          <p className="text-[#939084] text-sm">No pipeline runs yet</p>
          <p className="text-[#553DE9]/60 text-xs mt-1">Trigger a pipeline or push to your repository</p>
        </div>
      )}

      {!loading && pipelines.length > 0 && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto terminal-scroll">
          {pipelines.map(run => (
            <PipelineRunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
