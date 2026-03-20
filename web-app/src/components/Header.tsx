import { ArrowLeft, Share2, Download, Eye, EyeOff } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { Badge } from './ui/Badge';
import { CostTracker } from './CostTracker';
import { api } from '../api/client';

interface HeaderProps {
  sessionId?: string;
  sessionName?: string;
  status?: string;
  wsConnected: boolean;
  onBack?: () => void;
  showPreview?: boolean;
  onTogglePreview?: () => void;
  canPreview?: boolean;
}

function mapStatusToBadge(status?: string): 'completed' | 'running' | 'failed' | 'started' | 'empty' {
  if (!status) return 'empty';
  switch (status) {
    case 'completed':
    case 'completion_promise_fulfilled':
      return 'completed';
    case 'in_progress':
    case 'building':
      return 'running';
    case 'error':
    case 'failed':
      return 'failed';
    case 'started':
      return 'started';
    default:
      return 'empty';
  }
}

export function Header({
  sessionId,
  sessionName,
  status,
  wsConnected,
  onBack,
  showPreview,
  onTogglePreview,
  canPreview,
}: HeaderProps) {
  const badgeStatus = mapStatusToBadge(status);
  const displayName = sessionName || sessionId || 'Untitled';

  return (
    <header className="h-12 border-b border-border bg-card px-3 flex items-center gap-3 flex-shrink-0">
      {/* Back button */}
      {onBack && (
        <IconButton icon={ArrowLeft} label="Back" size="sm" onClick={onBack} />
      )}

      {/* Session name */}
      <span className="text-sm font-semibold text-ink truncate max-w-[200px]">
        {displayName}
      </span>

      {/* Status badge */}
      {status && (
        <Badge status={badgeStatus}>{status}</Badge>
      )}

      {/* Connection indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            wsConnected ? 'bg-success' : 'bg-danger'
          }`}
        />
        <span className="text-xs text-muted-accessible font-medium">
          {wsConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Cost tracker */}
      <CostTracker className="ml-1" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Preview toggle */}
      {canPreview && onTogglePreview && (
        <IconButton
          icon={showPreview ? EyeOff : Eye}
          label={showPreview ? 'Hide Preview' : 'Show Preview'}
          size="sm"
          onClick={onTogglePreview}
        />
      )}

      {/* Share */}
      <IconButton
        icon={Share2}
        label="Share"
        size="sm"
        disabled={!sessionId}
        title={sessionId ? 'Share session' : 'Coming soon'}
        onClick={() => {
          if (!sessionId) return;
          api.shareSession().then((result) => {
            if (result?.url) window.open(result.url, '_blank');
            else alert('Share output: ' + (result?.output || 'No URL returned'));
          }).catch(() => alert('Failed to create share link'));
        }}
      />

      {/* Export */}
      <IconButton
        icon={Download}
        label="Export"
        size="sm"
        disabled={!sessionId}
        title={sessionId ? 'Export project' : 'Coming soon'}
        onClick={() => {
          if (!sessionId) return;
          api.exportProject(sessionId).then((result) => {
            alert('Export: ' + JSON.stringify(result));
          }).catch(() => alert('Failed to export project'));
        }}
      />
    </header>
  );
}
