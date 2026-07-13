'use client';

import React, { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { runClustering } from '@/lib/topicClusters';
import type { ClusterResult } from '@/lib/types';

interface TopicHeatmapProps {
  sessionId: string | null; // null = analyze all historical projects
  weekStart: string; // ISO date (Monday)
  isHost: boolean;
  projects: Array<{ id: string; title: string }>;
}

type Stage = 'idle' | 'loading' | 'embedding' | 'clustering' | 'success' | 'error' | 'empty';

interface ClusterDisplay {
  theme_label: string;
  confidence: number;
  project_ids: string[];
  exampleTitles: string[];
}

export default function TopicHeatmap({ sessionId, weekStart, isHost, projects }: TopicHeatmapProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterDisplay[]>([]);

  const [allProjects, setAllProjects] = useState<Array<{ id: string; title: string }>>([]);

  const handleRunClustering = useCallback(async () => {
    setStage('loading');
    setError(null);
    setProgress(0);

    try {
      let titles: Array<{ id: string; title: string }>;

      if (sessionId) {
        // Session-specific: use current projects from props
        titles = projects.map(p => ({ id: p.id, title: p.title }));
      } else {
        // Global historical: fetch ALL projects from database
        setStage('loading');
        const { data: allProjectsData, error: queryError } = await supabase
          .from('projects')
          .select('id, title')
          .not('title', 'is', null);

        if (queryError) throw new Error(`Failed to fetch historical projects: ${queryError.message}`);
        
        titles = (allProjectsData ?? []).map(p => ({ id: p.id, title: p.title }));
        setAllProjects(titles);
      }

      if (titles.length === 0) {
        setStage('empty');
        setClusters([]);
        return;
      }

      const results = await runClustering(titles, { sessionId, weekStart }, (stage, progress) => {
        if (stage === 'loading') setStage('loading');
        else if (stage === 'embedding') setStage('embedding');
        else if (stage === 'clustering') setStage('clustering');
        setProgress(progress);
      });

      if (results.length === 0) {
        setStage('empty');
        setClusters([]);
        return;
      }

      // Group results by cluster_label
      const clusterMap = new Map<string, ClusterResult[]>();
      for (const r of results) {
        if (!clusterMap.has(r.cluster_label)) clusterMap.set(r.cluster_label, []);
        clusterMap.get(r.cluster_label)!.push(r);
      }

      const projectSource = sessionId ? projects : allProjects;
      const displays: ClusterDisplay[] = [];
      for (const [label, members] of clusterMap.entries()) {
        const project_ids = members.map(m => m.project_id);
        const exampleTitles = members.slice(0, 3).map(m => {
          const p = projectSource.find(proj => proj.id === m.project_id);
          return p?.title ?? m.project_id;
        });
        const avgConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;

        displays.push({
          theme_label: label,
          confidence: avgConfidence,
          project_ids,
          exampleTitles,
        });
      }

      // Sort by project_count desc
      displays.sort((a, b) => b.project_ids.length - a.project_ids.length);

      setClusters(displays);
      setStage('success');
    } catch (err) {
      console.error('[TopicHeatmap] Clustering error:', err);
      const errorMessage = err instanceof Error 
        ? `Error: ${err.message}` 
        : 'Error desconocido al analizar temas. Revisa la consola (F12) para más detalles.';
      setError(errorMessage);
      setStage('error');
    }
  }, [projects, sessionId, weekStart, allProjects]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!isHost) return null;

  return (
    <div className="mt-6 p-6 bg-black/20 rounded-2xl border border-white/10">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleRunClustering}
          disabled={stage !== 'idle' && stage !== 'success' && stage !== 'error' && stage !== 'empty'}
          className="bg-kitchen-hot/20 hover:bg-kitchen-hot/30 disabled:opacity-50 disabled:cursor-not-allowed text-kitchen-hot font-bold px-4 py-2 rounded-xl border border-kitchen-hot/30 transition-all flex items-center gap-2"
        >
          <span className="text-lg">🔥</span>
          Analizar temas
        </button>
        <span className="text-white/40 font-mono text-xs uppercase tracking-widest">
          Clustering semántico
        </span>
      </div>

      {/* Progress states */}
      {stage === 'loading' && (
        <ProgressBar label="Descargando modelo..." progress={progress} />
      )}
      {stage === 'embedding' && (
        <ProgressBar label="Generando embeddings..." progress={progress} />
      )}
      {stage === 'clustering' && (
        <ProgressBar label="Agrupando temas..." progress={progress} />
      )}

      {/* Error state */}
      {stage === 'error' && (
        <div className="p-4 bg-kitchen-hot/20 border border-kitchen-hot/30 rounded-xl">
          <p className="text-kitchen-hot font-mono text-sm mb-2">❌ Error</p>
          <p className="text-white/60 font-mono text-xs">{error}</p>
          <button
            onClick={() => setStage('idle')}
            className="mt-2 text-xs text-white/40 hover:text-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Empty state */}
      {stage === 'empty' && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <p className="text-white/60 font-mono text-sm">No hay platos para analizar</p>
        </div>
      )}

      {/* Success state — cluster visualization */}
      {stage === 'success' && clusters.length > 0 && (
        <div className="space-y-3">
          <p className="text-white/40 font-mono text-xs uppercase tracking-widest mb-3">
            {clusters.length} tema{clusters.length !== 1 ? 's' : ''} detectado{clusters.length !== 1 ? 's' : ''}
          </p>
          {clusters.map((cluster, i) => (
            <ClusterCard key={i} cluster={cluster} />
          ))}
        </div>
      )}

      {stage === 'success' && clusters.length === 0 && (
        <p className="text-white/40 font-mono text-sm">No se detectaron temas.</p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex justify-between mb-2">
        <span className="text-white/60 font-mono text-xs">{label}</span>
        <span className="text-white/40 font-mono text-xs">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-kitchen-cool transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: ClusterDisplay }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h4 className="text-white font-bold text-sm">{cluster.theme_label}</h4>
          <p className="text-white/40 font-mono text-xs mt-0.5">
            {cluster.project_ids.length} plato{cluster.project_ids.length !== 1 ? 's' : ''}
          </p>
        </div>
        <ConfidenceBar confidence={cluster.confidence} />
      </div>
      {cluster.exampleTitles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cluster.exampleTitles.map((title, i) => (
            <span
              key={i}
              className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded text-white/50 truncate max-w-[200px]"
              title={title}
            >
              {title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? 'bg-kitchen-cool' : confidence >= 0.4 ? 'bg-yellow-500' : 'bg-white/30';

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white/40">{percent}%</span>
    </div>
  );
}
