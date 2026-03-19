import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';
import type { PlanResult } from '../api/client';
import { PlanModal } from './PlanModal';

interface PRDInputProps {
  onSubmit: (prd: string, provider: string, projectDir?: string, mode?: string) => Promise<void>;
  running: boolean;
  error?: string | null;
  provider?: string;
  onProviderChange?: (provider: string) => void;
}

interface TemplateItem {
  name: string;
  filename: string;
}

export function PRDInput({ onSubmit, running, error, provider: providerProp, onProviderChange }: PRDInputProps) {
  const [prd, setPrd] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [localProvider, setLocalProvider] = useState('claude');
  const [projectDir, setProjectDir] = useState('');
  // Use controlled provider if provided by parent, otherwise use local state
  const provider = providerProp ?? localProvider;
  const setProvider = (p: string) => {
    setLocalProvider(p);
    onProviderChange?.(p);
  };
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Load templates from backend (no hardcoded fallback -- show warning on failure)
  useEffect(() => {
    api.getTemplates()
      .then((list) => {
        setTemplates(list);
        setTemplateLoadError(false);
      })
      .catch(() => {
        setTemplates([]);
        setTemplateLoadError(true);
      });
  }, []);

  // On mount: restore draft from localStorage, then check for PRD prefill from CLI
  useEffect(() => {
    const draft = localStorage.getItem('loki-prd-draft');
    if (draft) {
      setPrd(draft);
    }
    api.getPrdPrefill()
      .then(({ content }) => {
        if (content) {
          setPrd(content);
        }
      })
      .catch(() => {
        // No prefill available -- ignore
      });
  }, []);

  // Auto-save PRD draft to localStorage on change
  useEffect(() => {
    if (prd.trim()) {
      localStorage.setItem('loki-prd-draft', prd);
    } else {
      localStorage.removeItem('loki-prd-draft');
    }
  }, [prd]);

  // Warn on page close if PRD has unsaved content
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (prd.trim()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [prd]);

  const handleTemplateSelect = useCallback(async (filename: string, name: string) => {
    setSelectedTemplate(name);
    setShowTemplates(false);
    try {
      const result = await api.getTemplateContent(filename);
      setPrd(result.content);
    } catch {
      setPrd(`# ${name}\n\n## Overview\n\nDescribe your project here...\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Technical Requirements\n\n- Requirement 1\n- Requirement 2\n`);
    }
  }, []);

  const handleEstimate = async () => {
    if (!prd.trim() || planLoading) return;
    setPlanLoading(true);
    setPlanResult(null);
    setShowPlanModal(true);
    try {
      const result = await api.planSession(prd, provider);
      setPlanResult(result);
    } catch {
      setPlanResult({
        complexity: 'unknown',
        cost_estimate: 'N/A',
        iterations: 0,
        phases: [],
        output_text: 'Failed to run loki plan. The CLI may not be available.',
        returncode: 1,
      });
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!prd.trim() || running || submitting) return;
    setShowPlanModal(false);
    setSubmitting(true);
    try {
      await onSubmit(prd, provider, projectDir.trim() || undefined, quickMode ? 'quick' : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    {showPlanModal && (
      <PlanModal
        plan={planResult}
        loading={planLoading}
        onConfirm={handleSubmit}
        onCancel={() => setShowPlanModal(false)}
      />
    )}
    <div className="glass p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">
          Product Requirements
        </h3>
        <div className="flex items-center gap-2">
          {/* Template selector */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-xs font-medium px-3 py-1.5 rounded-xl border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
            >
              {selectedTemplate || 'Templates'}
            </button>

            {showTemplates && (
              <div className="absolute right-0 top-full mt-1 w-56 glass-subtle rounded-xl overflow-hidden z-20 shadow-glass">
                <div className="py-1 max-h-64 overflow-y-auto terminal-scroll">
                  {templateLoadError && (
                    <div className="px-3 py-2 text-xs text-warning border-b border-warning/10">
                      Could not load templates from server. Check that the backend is running.
                    </div>
                  )}
                  {!templateLoadError && templates.length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate">Loading...</div>
                  )}
                  {templates.map((t) => (
                    <button
                      key={t.filename}
                      onClick={() => handleTemplateSelect(t.filename, t.name)}
                      className="w-full text-left px-3 py-2 text-sm text-charcoal hover:bg-primary/5 transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PRD textarea */}
      <textarea
        value={prd}
        onChange={(e) => setPrd(e.target.value)}
        placeholder="Paste your PRD here, or select a template above to get started..."
        className="flex-1 min-h-[280px] w-full bg-white/40 rounded-xl border border-white/30 px-4 py-3 text-sm font-mono text-charcoal placeholder:text-primary-wash resize-none focus:outline-none focus:ring-2 focus:ring-accent-product/20 focus:border-accent-product/30 transition-all"
        spellCheck={false}
      />

      {/* Project directory field */}
      <div className="mt-3">
        <label className="block text-xs text-slate font-medium mb-1 uppercase tracking-wider">
          Project Directory
        </label>
        <input
          type="text"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
          placeholder="Leave blank to auto-create, or type a path (e.g. /Users/you/my-project)"
          className="w-full bg-white/40 rounded-xl border border-white/30 px-4 py-2 text-sm font-mono text-charcoal placeholder:text-primary-wash/70 focus:outline-none focus:ring-2 focus:ring-accent-product/20 focus:border-accent-product/30 transition-all"
          spellCheck={false}
        />
        <p className="text-[10px] text-slate mt-1">
          Type a path or leave blank to auto-create under ~/purple-lab-projects/
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-medium">
          {error}
        </div>
      )}

      {/* Control bar */}
      <div className="flex items-center gap-3 mt-4">
        {/* Quick Mode toggle */}
        <button
          onClick={() => setQuickMode(!quickMode)}
          title="Quick Mode: 3 iterations max, faster builds"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            quickMode
              ? 'bg-accent-product/10 border-accent-product/30 text-accent-product'
              : 'border-white/30 text-slate hover:text-charcoal hover:bg-white/20'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${quickMode ? 'bg-accent-product' : 'bg-slate/40'}`} />
          Quick
        </button>

        <div className="flex-1" />

        {/* Character count */}
        <span className="text-xs text-slate font-mono">
          {prd.length.toLocaleString()} chars
        </span>

        {/* Estimate button */}
        <button
          onClick={handleEstimate}
          disabled={!prd.trim() || running || planLoading}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
            !prd.trim() || running || planLoading
              ? 'border-white/20 text-slate/40 cursor-not-allowed'
              : 'border-accent-product/30 text-accent-product hover:bg-accent-product/5'
          }`}
        >
          {planLoading ? 'Analyzing...' : 'Estimate'}
        </button>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!prd.trim() || running || submitting}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            !prd.trim() || running || submitting
              ? 'bg-surface/50 text-slate cursor-not-allowed'
              : 'bg-accent-product text-white hover:bg-accent-product/90 shadow-glass-subtle'
          }`}
        >
          {submitting ? 'Starting...' : running ? 'Building...' : 'Start Build'}
        </button>
      </div>
    </div>
    </>
  );
}
