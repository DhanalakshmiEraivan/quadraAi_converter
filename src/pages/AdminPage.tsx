import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  LayoutDashboard, Users, FileStack, BarChart3, HardDrive, Settings,
  Activity, CheckCircle2, XCircle, Loader2, ShieldCheck,
  Zap, Star, Clock, TrendingUp, AlertTriangle, Database, Server, Cpu, Gauge,
  ArrowUpRight, ArrowDownRight, FileText, Image as ImageIcon,
  Type, FileCode2, QrCode, Calculator, KeyRound, Palette, Search,
} from 'lucide-react';
type AdminTab = 'overview' | 'users' | 'conversions' | 'analytics' | 'storage' | 'tools' | 'settings';
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  pdf: FileText,
  text: Type,
  developer: FileCode2,
  dev: FileCode2,
  qr: QrCode,
  color: Palette,
  calc: Calculator,
  calculator: Calculator,
  security: KeyRound,
  convert: FileText,
};
interface ConversionRecord {
  id: string;
  tool_id: string;
  tool_name: string;
  category: string;
  input_name: string | null;
  output_name: string | null;
  output_format: string;
  status: string;
  file_size: number | null;
  created_at: string;
  user_email?: string;
}
interface UserRecord {
  id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
  conversion_count: number;
}
interface AdminStats {
  totalUsers: number;
  totalConversions: number;
  completedConversions: number;
  failedConversions: number;
  totalStorage: number;
  adminCount: number;
  byCategory: Record<string, number>;
  byTool: { id: string; name: string; count: number }[];
  recentConversions: ConversionRecord[];
  recentUsers: UserRecord[];
  successRate: number;
  avgFileSize: number;
  last7Days: { date: string; count: number }[];
}
export function AdminPage({ navigate }: { navigate: (path: string) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const loadStats = useCallback(async () => {
    setLoading(true);

    const [convResult, usersResult] = await Promise.all([
      supabase.from('conversions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ]);
    const conversions = (convResult.data || []) as ConversionRecord[];
    const users = (usersResult.data || []) as UserRecord[];
    const byCategory: Record<string, number> = {};
    const byToolMap: Record<string, { id: string; name: string; count: number }> = {};
    for (const c of conversions) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
      if (!byToolMap[c.tool_id]) byToolMap[c.tool_id] = { id: c.tool_id, name: c.tool_name, count: 0 };
      byToolMap[c.tool_id].count++;
    }
    const byTool = Object.values(byToolMap).sort((a, b) => b.count - a.count).slice(0, 10);
    const completed = conversions.filter((c) => c.status === 'completed').length;
    const failed = conversions.filter((c) => c.status === 'failed').length;
    const totalStorage = conversions.reduce((sum, c) => sum + (c.file_size || 0), 0);
    const last7Days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = conversions.filter((c) => c.created_at.startsWith(dateStr)).length;
      last7Days.push({ date: dateStr, count });
    }
    const recentConversions = conversions.slice(0, 20);
    const recentUsers = users.slice(0, 10);
    setStats({
      totalUsers: users.length,
      totalConversions: conversions.length,
      completedConversions: completed,
      failedConversions: failed,
      totalStorage,
      adminCount: users.filter((u) => u.is_admin).length,
      byCategory,
      byTool,
      recentConversions,
      recentUsers,
      successRate: conversions.length > 0 ? (completed / conversions.length) * 100 : 0,
      avgFileSize: conversions.length > 0 ? totalStorage / conversions.length : 0,
      last7Days,
    });
    setLoading(false);
  }, []);
  useEffect(() => {
    loadStats();
  }, [loadStats]);
  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'conversions', label: 'Conversions', icon: FileStack },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'tools', label: 'Tool Usage', icon: Cpu },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];
  if (loading || !stats) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
          <p className="text-ink-500 mt-3">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-ink-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-ink-200 hidden lg:flex flex-col shrink-0">
        <div className="p-6 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-ink-900 text-sm">Admin Panel</p>
              <p className="text-xs text-ink-500">{user?.email}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${tab === item.id ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-ink-100">
          <button onClick={() => navigate('/dashboard')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition">
            <LayoutDashboard className="w-4 h-4" /> User Dashboard
          </button>
        </div>
      </aside>
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile tab selector */}
        <div className="lg:hidden bg-white border-b border-ink-200 p-4">
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === item.id ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600'}`}
              >
                <item.icon className="w-3.5 h-3.5" /> {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6 lg:p-8 max-w-6xl">
          {tab === 'overview' && <OverviewTab stats={stats} />}
          {tab === 'users' && <UsersTab stats={stats} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
          {tab === 'conversions' && <ConversionsTab stats={stats} />}
          {tab === 'analytics' && <AnalyticsTab stats={stats} />}
          {tab === 'storage' && <StorageTab stats={stats} />}
          {tab === 'tools' && <ToolsTab stats={stats} />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
function OverviewTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Overview</h1>
        <p className="text-ink-500 mt-1">Platform statistics and health at a glance</p>
      </div>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Users" value={String(stats.totalUsers)} sub={`${stats.adminCount} admins`} color="from-brand-500 to-brand-600" trend="+12%" trendUp />
        <StatCard icon={FileStack} label="Total Conversions" value={String(stats.totalConversions)} sub={`${stats.completedConversions} completed`} color="from-accent-500 to-accent-600" trend="+8%" trendUp />
        <StatCard icon={Gauge} label="Success Rate" value={`${stats.successRate.toFixed(1)}%`} sub={`${stats.failedConversions} failed`} color="from-success-500 to-success-600" trend="+2%" trendUp />
        <StatCard icon={HardDrive} label="Storage Used" value={formatBytes(stats.totalStorage)} sub={`Avg ${formatBytes(stats.avgFileSize)}/file`} color="from-warn-500 to-warn-600" trend="-3%" trendUp={false} />
      </div>
      {/* 7-Day Activity Chart */}
      <div className="bg-white rounded-3xl border border-ink-200 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-600" /> Last 7 Days Activity
        </h2>
        <div className="flex items-end justify-between gap-2 h-40">
          {stats.last7Days.map((day) => {
            const maxCount = Math.max(...stats.last7Days.map((d) => d.count), 1);
            const heightPct = (day.count / maxCount) * 100;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full bg-ink-100 rounded-lg overflow-hidden flex items-end" style={{ height: '120px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-brand-500 to-accent-400 rounded-lg transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-xs text-ink-400">{new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}</span>
                <span className="text-xs font-semibold text-ink-700">{day.count}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Recent Conversions */}
      <div className="bg-white rounded-3xl border border-ink-200 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand-600" /> Recent Conversions
        </h2>
        <div className="divide-y divide-ink-50">
          {stats.recentConversions.slice(0, 8).map((conv) => (
            <div key={conv.id} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0">
                {(() => {
                  const Icon = categoryIcons[conv.category] || FileText;
                  return <Icon className="w-4 h-4" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-900 truncate">{conv.tool_name}</p>
                <p className="text-xs text-ink-500 truncate">{conv.input_name || '—'}</p>
              </div>
              {conv.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-accent-500 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-err-500 shrink-0" />
              )}
              <span className="text-xs text-ink-400 shrink-0">{formatBytes(conv.file_size)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function UsersTab({ stats, searchQuery, setSearchQuery }: { stats: AdminStats; searchQuery: string; setSearchQuery: (v: string) => void }) {
  const filtered = stats.recentUsers.filter((u) => u.email?.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Users</h1>
          <p className="text-ink-500 mt-1">{stats.totalUsers} registered users</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users…"
            className="rounded-xl border border-ink-200 pl-9 pr-4 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-ink-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-ink-50 border-b border-ink-100">
            <tr>
              <th className="text-left text-xs font-semibold text-ink-500 uppercase px-5 py-3">User</th>
              <th className="text-left text-xs font-semibold text-ink-500 uppercase px-5 py-3">Role</th>
              <th className="text-left text-xs font-semibold text-ink-500 uppercase px-5 py-3">Joined</th>
              <th className="text-right text-xs font-semibold text-ink-500 uppercase px-5 py-3">Conversions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-ink-50 transition">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 text-white grid place-items-center text-xs font-bold">
                      {u.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm font-medium text-ink-900">{u.email}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {u.is_admin ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-md">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-ink-500">User</span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm text-ink-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-sm font-semibold text-ink-900 text-right">{u.conversion_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ConversionsTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">All Conversions</h1>
        <p className="text-ink-500 mt-1">{stats.totalConversions} total conversions</p>
      </div>
      <div className="bg-white rounded-3xl border border-ink-200 overflow-hidden">
        <div className="divide-y divide-ink-50 max-h-[600px] overflow-auto">
          {stats.recentConversions.map((conv) => (
            <div key={conv.id} className="flex items-center gap-4 p-4 hover:bg-ink-50 transition">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 grid place-items-center shrink-0">
                {(() => {
                  const Icon = categoryIcons[conv.category] || FileText;
                  return <Icon className="w-5 h-5" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-900 truncate">{conv.tool_name}</p>
                <p className="text-xs text-ink-500 truncate">{conv.input_name || '—'} → {conv.output_name || '—'}</p>
              </div>
              <div className="text-right shrink-0">
                {conv.status === 'completed' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Done
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-err-500">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
                <p className="text-xs text-ink-400 mt-0.5">{formatBytes(conv.file_size)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function AnalyticsTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Analytics</h1>
        <p className="text-ink-500 mt-1">Deep insights into platform usage</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard icon={TrendingUp} label="Success Rate" value={`${stats.successRate.toFixed(1)}%`} color="text-accent-600" />
        <MetricCard icon={Zap} label="Avg File Size" value={formatBytes(stats.avgFileSize)} color="text-brand-600" />
        <MetricCard icon={Star} label="Top Category" value={Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'} color="text-warn-600" />
      </div>

      <div className="bg-white rounded-3xl border border-ink-200 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-4">Category Distribution</h2>
        <div className="space-y-3">
          {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
            const pct = stats.totalConversions > 0 ? (count / stats.totalConversions) * 100 : 0;
            const CatIcon = categoryIcons[cat] || FileText;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2 text-ink-600 capitalize">
                    <CatIcon className="w-4 h-4" /> {cat}
                  </span>
                  <span className="font-semibold text-ink-900">{count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function StorageTab({ stats }: { stats: AdminStats }) {
  const storagePct = Math.min((stats.totalStorage / (500 * 1024 * 1024)) * 100, 100);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Storage</h1>
        <p className="text-ink-500 mt-1">Monitor storage consumption across the platform</p>
      </div>
      <div className="bg-white rounded-3xl border border-ink-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white grid place-items-center">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <p className="text-3xl font-display font-extrabold text-ink-900">{formatBytes(stats.totalStorage)}</p>
            <p className="text-sm text-ink-500">of 500 MB used</p>
          </div>
        </div>
        <div className="h-4 bg-ink-100 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full transition-all duration-500" style={{ width: `${storagePct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-ink-500">
          <span>{storagePct.toFixed(1)}% used</span>
          <span>{formatBytes(500 * 1024 * 1024 - stats.totalStorage)} free</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MetricCard icon={Server} label="Avg per file" value={formatBytes(stats.avgFileSize)} color="text-brand-600" />
        <MetricCard icon={FileStack} label="Total files" value={String(stats.totalConversions)} color="text-accent-600" />
      </div>
    </div>
  );
}
function ToolsTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Tool Usage</h1>
        <p className="text-ink-500 mt-1">Most popular tools on the platform</p>
      </div>
      <div className="bg-white rounded-3xl border border-ink-200 p-6">
        <div className="space-y-4">
          {stats.byTool.map((t, i) => {
            const maxCount = stats.byTool[0]?.count || 1;
            const pct = (t.count / maxCount) * 100;
            return (
              <div key={t.id} className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center text-sm font-bold shrink-0">{i + 1}</span>
                <span className="text-sm font-medium text-ink-700 flex-1 truncate">{t.name}</span>
                <div className="w-32 h-2.5 bg-ink-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold text-ink-900 w-12 text-right">{t.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function SettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Settings</h1>
        <p className="text-ink-500 mt-1">Platform configuration and preferences</p>
      </div>
      <div className="bg-white rounded-3xl border border-ink-200 p-6 space-y-4">
        <SettingRow icon={ShieldCheck} label="Enable user registration" desc="Allow new users to sign up" enabled />
        <SettingRow icon={Zap} label="Auto-optimize conversions" desc="Compress output files automatically" enabled />
        <SettingRow icon={AlertTriangle} label="Maintenance mode" desc="Show maintenance page to users" enabled={false} />
        <SettingRow icon={Server} label="Rate limiting" desc="Limit conversions per user per day" enabled />
      </div>
    </div>
  );
}
function StatCard({ icon: Icon, label, value, sub, color, trend, trendUp }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; color: string; trend: string; trendUp: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} text-white grid place-items-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendUp ? 'text-accent-600' : 'text-err-500'}`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{trend}
        </span>
      </div>
      <p className="text-2xl font-display font-extrabold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
      <p className="text-xs text-ink-400 mt-0.5">{sub}</p>
    </div>
  );
}
function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200 p-5">
      <Icon className={`w-6 h-6 ${color} mb-2`} />
      <p className="text-xl font-display font-bold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </div>
  );
}

function SettingRow({ icon: Icon, label, desc, enabled }: {
  icon: React.ComponentType<{ className?: string }>; label: string; desc: string; enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-ink-50 text-ink-600 grid place-items-center">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">{label}</p>
          <p className="text-xs text-ink-500">{desc}</p>
        </div>
      </div>
      <div className={`w-11 h-6 rounded-full transition ${enabled ? 'bg-brand-500' : 'bg-ink-200'} relative cursor-pointer`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
      </div>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
