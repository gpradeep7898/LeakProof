
'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Package, TrendingUp, Users, AlertTriangle, ArrowUpDown } from 'lucide-react';

// Fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ProductIntelligencePage() {
  const [sort, setSort] = useState('revenue');
  const [filter, setFilter] = useState('all');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', sort],
    queryFn: () => fetcher(`/api/products?sort=${sort}`)
  });

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading Product Intelligence...</div>;

  const filteredProducts = (products || []).filter((p: any) => {
    if (filter === 'loyal') return parseFloat(p.repurchase_rate) >= 20;
    if (filter === 'churn') return parseFloat(p.repurchase_rate) < 10 && p.total_sold > 5;
    if (filter === 'nosales') return Number(p.total_revenue) === 0;
    if (filter === 'discount') return parseFloat(p.discount_usage_rate || 0) > 50;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Product Intelligence</h1>
          <p className="text-slate-500 mt-2">Analyze SKU performance, fatigue, and loyalty drivers.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">Export to CSV</button>
        </div>
      </div>

      {/* Quick Stats (Computed from data) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Products"
          value={products?.length || 0}
          icon={<Package className="text-slate-400" />}
        />
        <StatCard
          label="Active SKUs"
          value={products?.filter((p: any) => p.total_sold > 0).length || 0}
          icon={<TrendingUp className="text-emerald-500" />}
        />
        <StatCard
          label="High Loyalty Items"
          value={products?.filter((p: any) => parseFloat(p.repurchase_rate) >= 20).length || 0}
          icon={<Users className="text-blue-500" />}
        />
        <StatCard
          label="Churn Risk Items"
          value={products?.filter((p: any) => parseFloat(p.repurchase_rate) < 10 && p.total_sold > 5).length || 0}
          icon={<AlertTriangle className="text-amber-500" />}
        />
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 overflow-x-auto">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All Products" />
          <FilterButton active={filter === 'loyal'} onClick={() => setFilter('loyal')} label="High Loyalty" />
          <FilterButton active={filter === 'churn'} onClick={() => setFilter('churn')} label="High Churn" />
          <FilterButton active={filter === 'discount'} onClick={() => setFilter('discount')} label="Discount Dependent" />
          <FilterButton active={filter === 'nosales'} onClick={() => setFilter('nosales')} label="No Sales Yet" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4 cursor-pointer hover:text-slate-700" onClick={() => setSort('revenue')}>
                  <div className="flex items-center gap-1">Revenue <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4">Avg Price</th>
                <th className="px-6 py-4">Margin</th>
                <th className="px-6 py-4 cursor-pointer hover:text-slate-700" onClick={() => setSort('repeat')}>
                  <div className="flex items-center gap-1">Repeat Rate <ArrowUpDown size={14} /></div>
                </th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product: any) => (
                <tr key={product.product_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 max-w-xs truncate" title={product.product_name}>
                    {product.product_name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{product.sku}</td>
                  <td className="px-6 py-4 font-medium">
                    ${Number(product.total_revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    ${Number(product.avg_selling_price).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {product.gross_margin_pct}%
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${parseFloat(product.repurchase_rate) > 20 ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          style={{ width: `${Math.min(parseFloat(product.repurchase_rate), 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{Number(product.repurchase_rate).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {renderStatus(product)}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No products match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
    </div>
  );
}

function FilterButton({ active, onClick, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
        }`}
    >
      {label}
    </button>
  );
}

function renderStatus(product: any) {
  if (parseFloat(product.total_revenue) === 0) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">No Sales Yet</span>;
  }
  if (parseFloat(product.repurchase_rate) >= 20) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">High Loyalty</span>;
  }
  if (parseFloat(product.repurchase_rate) < 10 && product.total_sold > 5) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Churn Risk</span>;
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600">Active</span>;
}
