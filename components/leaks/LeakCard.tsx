'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

export function LeakCard({ leak, onApprove }: { leak: any; onApprove?: () => void }) {
  const authedFetch = useAuthenticatedFetch()
  const [loading, setLoading] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const updateStatus = async (status: string) => {
    setLoading(true);
    try {
      const r = await authedFetch(`/api/leaks/${leak.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      toast.success(`Marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ['leaks'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const fetchExplain = async () => {
    setLoading(true);
    setExplain(null);
    try {
      const r = await authedFetch(`/api/leaks/${leak.id}/explain`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      setExplain(j.explain);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load explanation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border-l-4 mb-3 ${
        leak.severity === 'high' ? 'border-red-500 bg-red-50/50' : 'border-amber-500 bg-amber-50/50'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-slate-800">{leak.title}</h3>
        <span className="font-mono font-bold text-red-600">
          -${Number(leak.estimated_monthly_loss || 0).toLocaleString()}/mo
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-3">{leak.description}</p>

      <div className="flex justify-between items-center text-xs text-slate-500 mb-3">
        <span className="bg-white px-2 py-1 rounded border border-slate-100">
          {Math.round((leak.confidence_score || 0) * 100)}% confidence
        </span>
        <span>
          {leak.affected_customers_count > 0
            ? `${leak.affected_customers_count} customers affected`
            : leak.affected_sku_count > 0
              ? `${leak.affected_sku_count} SKUs affected`
              : '—'}
        </span>
      </div>

      {explain && (
        <div className="mb-3 p-3 bg-slate-50 rounded text-sm text-slate-700 border border-slate-100">
          {explain}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={fetchExplain}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Explain This
        </button>
        <button
          onClick={() => updateStatus('planned')}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Mark Action Planned
        </button>
        <button
          onClick={() => updateStatus('executed')}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
        >
          Mark Executed
        </button>
        <button
          onClick={() => updateStatus('ignored')}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
        >
          Mark Ignored
        </button>
        {onApprove && (
          <button
            onClick={onApprove}
            className="px-3 py-1.5 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            Fix: {leak.recommended_action?.description || leak.recommended_action?.type || 'View Details'}
          </button>
        )}
      </div>
    </div>
  );
}
