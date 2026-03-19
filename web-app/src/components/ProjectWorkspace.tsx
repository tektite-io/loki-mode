import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';
import type { FileNode } from '../types/api';
import type { SessionDetail } from '../api/client';

interface ProjectWorkspaceProps {
  session: SessionDetail;
  onClose: () => void;
}

// Infer language from file extension for basic syntax coloring
function getLanguageClass(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'text-warning', ts: 'text-warning', tsx: 'text-warning', jsx: 'text-warning',
    py: 'text-primary', rb: 'text-danger', go: 'text-primary-light',
    html: 'text-danger', css: 'text-accent-product', json: 'text-success',
    md: 'text-slate', yaml: 'text-success', yml: 'text-success',
    sh: 'text-success', bash: 'text-success',
    rs: 'text-warning', java: 'text-warning', kt: 'text-accent-product',
  };
  return map[ext] || 'text-charcoal/80';
}

function getFileIcon(name: string, type: string): string {
  if (type === 'directory') return '[ ]';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: 'JS', ts: 'TS', tsx: 'TX', jsx: 'JX', py: 'PY', html: '<>', css: '##',
    json: '{}', md: 'MD', yml: 'YL', yaml: 'YL', sh: 'SH', go: 'GO',
    rs: 'RS', rb: 'RB', java: 'JV', kt: 'KT', sql: 'SQ', svg: 'SV',
  };
  return icons[ext] || '..';
}

function isPreviewable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['html', 'htm'].includes(ext);
}

function FileTree({
  nodes,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string, name: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand first 2 levels
    const set = new Set<string>();
    if (depth < 2) nodes.filter(n => n.type === 'directory').forEach(n => set.add(n.path));
    return set;
  });

  return (
    <div>
      {nodes.map((node) => {
        const isDir = node.type === 'directory';
        const isOpen = expanded.has(node.path);
        const isSelected = node.path === selectedPath;

        return (
          <div key={node.path}>
            <button
              onClick={() => {
                if (isDir) {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    next.has(node.path) ? next.delete(node.path) : next.add(node.path);
                    return next;
                  });
                } else {
                  onSelect(node.path, node.name);
                }
              }}
              className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs font-mono rounded transition-colors ${
                isSelected
                  ? 'bg-accent-product/10 text-accent-product'
                  : 'text-charcoal/70 hover:bg-white/40 hover:text-charcoal'
              }`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {isDir && (
                <span className="text-[10px] text-slate w-3 text-center flex-shrink-0">
                  {isOpen ? 'v' : '>'}
                </span>
              )}
              {!isDir && <span className="w-3 flex-shrink-0" />}
              <span className={`text-[10px] font-bold w-5 text-center flex-shrink-0 ${
                isDir ? 'text-accent-product' : getLanguageClass(node.name)
              }`}>
                {getFileIcon(node.name, node.type)}
              </span>
              <span className="truncate">{node.name}{isDir ? '/' : ''}</span>
              {!isDir && node.size !== undefined && node.size > 0 && (
                <span className="text-[10px] text-slate/50 ml-auto flex-shrink-0">
                  {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
                </span>
              )}
            </button>
            {isDir && isOpen && node.children && (
              <FileTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectWorkspace({ session, onClose }: ProjectWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (path: string, name: string) => {
    setSelectedFile(path);
    setSelectedFileName(name);
    setFileLoading(true);
    setShowPreview(false);
    try {
      const result = await api.getFileContent(path);
      setFileContent(result.content);
      // Auto-show preview for HTML files
      if (isPreviewable(name)) {
        setPreviewHtml(result.content);
      }
    } catch {
      setFileContent('[Error loading file]');
    } finally {
      setFileLoading(false);
    }
  }, []);

  // Try to auto-load index.html preview on mount
  useEffect(() => {
    const indexFile = session.files.find(f => f.name === 'index.html' && f.type === 'file');
    if (indexFile) {
      handleFileSelect(indexFile.path, indexFile.name);
    }
  }, [session.files, handleFileSelect]);

  const fileCount = session.files.reduce((acc, f) => {
    const count = (node: FileNode): number => {
      if (node.type === 'file') return 1;
      return (node.children || []).reduce((s, c) => s + count(c), 0);
    };
    return acc + count(f);
  }, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="glass px-5 py-3 flex items-center gap-4 flex-shrink-0 border-b border-white/10">
        <button
          onClick={onClose}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/20 text-slate hover:text-charcoal hover:bg-white/30 transition-colors"
        >
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-charcoal truncate">{session.id}</h2>
          <p className="text-[10px] font-mono text-slate truncate">{session.path}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          session.status === 'completed' || session.status === 'completion_promise_fulfilled'
            ? 'bg-success/10 text-success'
            : 'bg-slate/10 text-slate'
        }`}>
          {session.status}
        </span>
        <span className="text-[10px] font-mono text-slate">{fileCount} files</span>
        {previewHtml && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showPreview
                ? 'border-accent-product/40 bg-accent-product/10 text-accent-product'
                : 'border-white/20 text-slate hover:text-charcoal hover:bg-white/30'
            }`}
          >
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        )}
      </div>

      {/* Main workspace: file tree | code viewer | optional preview */}
      <div className="flex-1 flex min-h-0">
        {/* File tree sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-white/10 overflow-y-auto terminal-scroll bg-white/30">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-[10px] text-slate uppercase tracking-wider font-semibold">Files</span>
          </div>
          {session.files.length > 0 ? (
            <FileTree
              nodes={session.files}
              selectedPath={selectedFile}
              onSelect={handleFileSelect}
            />
          ) : (
            <div className="p-4 text-xs text-slate">No files in project</div>
          )}
        </div>

        {/* Code viewer */}
        <div className={`flex-1 flex flex-col min-w-0 ${showPreview ? 'max-w-[50%]' : ''}`}>
          {selectedFile ? (
            <>
              <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 flex-shrink-0 bg-white/20">
                <span className={`text-[10px] font-bold ${getLanguageClass(selectedFileName)}`}>
                  {getFileIcon(selectedFileName, 'file')}
                </span>
                <span className="text-xs font-mono text-charcoal truncate">{selectedFile}</span>
              </div>
              <div className="flex-1 overflow-auto terminal-scroll bg-charcoal/[0.03] p-4">
                {fileLoading ? (
                  <div className="text-slate text-xs animate-pulse">Loading...</div>
                ) : (
                  <pre className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${getLanguageClass(selectedFileName)}`}>
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate text-sm">
              Select a file to view its contents
            </div>
          )}
        </div>

        {/* Preview panel (HTML files) */}
        {showPreview && previewHtml && (
          <div className="w-[50%] flex-shrink-0 border-l border-white/10 flex flex-col">
            <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 flex-shrink-0 bg-white/20">
              <span className="text-xs font-semibold text-charcoal">Live Preview</span>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                srcDoc={previewHtml}
                title="Project Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
