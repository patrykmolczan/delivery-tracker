import React, { useState, useEffect, useMemo } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ChangePasswordModal from './components/ChangePasswordModal'
import { LoginPage } from './pages/LoginPage'
import { NewProjectPage } from './pages/NewProjectPage'
import { ImportPage } from './pages/ImportPage'
import { AdminPage } from './pages/AdminPage'
import { AIPage } from './pages/AIPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { KPICards } from './components/KPICards'
import { FilterBar } from './components/FilterBar'
import { ProjectTable } from './components/ProjectTable'
import { ProjectDetail } from './components/ProjectDetail'
import { Charts } from './components/Charts'
import {
  fetchProjects, fetchStatusCounts, fetchOwnerCounts, buildLookupMaps, fetchLookups,
  fetchFilterOptions, computeKPIs, filterProjects, sortProjects, fetchAllProjectCountries,
  bulkUpdateProjectStatus
} from './lib/data'
import { useLogo } from './hooks/useLogo'
import type { Project, FilterState, SortState, StatusCount, OwnerCount, ViewMode, LookupItem } from './types'
import {
  LayoutDashboard, Table2, RefreshCw, LogOut, Lock, Truck, Loader2,
  Plus, Upload, Shield, Sparkles, Menu, X, ChevronRight, Sun, Moon
} from 'lucide-react'
import { useTheme } from './contexts/ThemeContext'
import { supabase, supabaseRealtime } from './lib/supabase'
import { NotificationBell } from './components/NotificationBell'
import { NotificationInbox } from './pages/NotificationInbox'
import { EntraCallbackPage } from './pages/EntraCallbackPage'

const NAV_ITEMS: Array<{ id: ViewMode; label: string; icon: React.ReactNode; adminOnly?: boolean; superAdminOnly?: boolean }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'table', label: 'All Projects', icon: <Table2 size={16} /> },
  { id: 'new-project', label: 'New Project', icon: <Plus size={16} /> },
  { id: 'import', label: 'Import Data', icon: <Upload size={16} /> },
  { id: 'ai', label: 'AI Insights', icon: <Sparkles size={16} /> },
  { id: 'admin', label: 'Admin', icon: <Shield size={16} />, superAdminOnly: true },
]

// Number of rows shown in the dashboard preview table — change this one value to adjust
const DASHBOARD_TABLE_ROWS = 25

const Dashboard: React.FC = () => {
  const { user, profile, isAdmin, isSuperAdmin, signOut } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const isSSOUser = !!(user?.user_metadata?.sso_provider)
  const { logoUrl } = useLogo()
  const { isDark, toggleTheme } = useTheme()
  const [projects, setProjects] = useState<Project[]>([])
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([])
  const [ownerCounts, setOwnerCounts] = useState<OwnerCount[]>([])
  const [filterOptions, setFilterOptions] = useState({ owners: [] as string[], analysts: [] as string[], clientTypes: [] as string[], industries: [] as string[], countries: [] as string[], statuses: [] as string[] })
  const [filters, setFilters] = useState<FilterState>({ search: '', status: [], owner: [], analyst: [], clientType: [], industry: [], country: [], dateFrom: '', dateTo: '' })
  const [sort, setSort] = useState<SortState>({ field: 'date_received', direction: 'desc' })
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedProjectTab, setSelectedProjectTab] = useState<'details' | 'history' | 'files' | 'delivery' | 'review' | undefined>(undefined)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [view, setView] = useState<ViewMode>('dashboard')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [countriesMap, setCountriesMap] = useState<Map<string, string[]>>(new Map())
  const [statusLookups, setStatusLookups] = useState<LookupItem[]>([])

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      // Fetch lookups first (tiny, fast), then projects once (no JOINs)
      const lookups = await fetchLookups()
      setStatusLookups(lookups.statuses)
      const lookupMaps = buildLookupMaps(lookups)
      const [proj, opts] = await Promise.all([
        fetchProjects(lookupMaps),
        fetchFilterOptions([] as any) // will be overwritten below with real owners
      ])
      // Compute stats in-memory from already-loaded projects
      const sc = fetchStatusCounts(proj)
      // Fetch inactive analyst names to exclude from Workload by Owner chart
      const { data: inactiveAnalystRows } = await supabaseRealtime.from('analysts').select('name').eq('is_active', false)
      const inactiveAnalystNames = new Set<string>((inactiveAnalystRows || []).map((r: any) => r.name))
      const oc = fetchOwnerCounts(proj, inactiveAnalystNames)
      // Re-compute filter options with real owners
      const optsWithOwners = { ...opts, owners: [...new Set(proj.map((p: any) => p.project_owner).filter(Boolean))].sort() as string[] }
      setProjects(proj)
      setStatusCounts(sc)
      setOwnerCounts(oc)
      setFilterOptions(optsWithOwners)
      // Fire-and-forget — loads multi-country data for hover popover without blocking spinner
      fetchAllProjectCountries().then(setCountriesMap).catch(console.warn)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // SAFETY NET: if loadData() hangs for >12s, force sign-out so AuthContext clears
  // the session and AppInner renders LoginPage — no redirect loop possible.
  // Do NOT call supabase.auth.getSession() here — it can itself hang when the SDK
  // is stuck retrying a dead token refresh (exactly the scenario we're trying to escape).
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => {
      signOut()
    }, 12000)
    return () => clearTimeout(timer)
  }, [loading])

  // Periodic session expiry check — every 30 s, sign out if access token is expired.
  // Uses getSession() (approved method) — never refreshSession() — navigator.locks safe.
  useEffect(() => {
    const CHECK_INTERVAL = 30 * 1000 // 30 seconds
    const id = setInterval(async () => {
      const { data: { session } } = await supabaseRealtime.auth.getSession()
      const nowSec = Math.floor(Date.now() / 1000)
      if (!session || (session.expires_at && session.expires_at < nowSec)) {
        signOut()
      }
    }, CHECK_INTERVAL)
    return () => clearInterval(id)
  }, [])

  // Real-time: auto-refresh project table when a new project is inserted
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('projects-insert-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projects' }, () => {
        loadData(true)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, () => {
        loadData(true)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects' }, () => {
        loadData(true)
      })
      .subscribe()
    return () => { supabaseRealtime.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => filterProjects(projects, filters), [projects, filters])
  const sorted = useMemo(() => sortProjects(filtered, sort), [filtered, sort])
  const kpis = useMemo(() => computeKPIs(projects), [projects])

  const navigate = (v: ViewMode) => {
    setView(v)
    setSidebarOpen(false)
    setEditProject(null)
  }

  const handleProjectSaved = (_project: Project) => {
    loadData(true)
    setEditProject(null)
    setView('table')
  }

  const handleBulkStatusUpdate = async (ids: string[], statusId: number) => {
    await bulkUpdateProjectStatus(ids, statusId)
    await loadData(true)
  }

  const handleEditProject = (project: Project) => {
    setEditProject(project)
    setView('new-project')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-primary animate-spin" />
          <p className="text-base-content/50">Loading delivery data…</p>
        </div>
      </div>
    )
  }

  const navItems = NAV_ITEMS.filter(item => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuperAdmin))

  return (
    <div className="min-h-screen bg-base-100 flex">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-base-200 border-r border-base-300 z-40 flex flex-col
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="p-4 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <div className={`rounded-md px-1.5 py-0.5 mr-1 transition-colors ${isDark ? 'bg-white/90' : 'bg-transparent'}`}>
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-8 w-auto object-contain"
                  style={{ maxHeight: '32px' }}
                />
              </div>
            ) : (
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Truck size={18} className="text-primary" />
              </div>
            )}
            <div>
              <p className="font-bold text-sm text-base-content">Delivery Tracker</p>
              <p className="text-xs text-base-content/40">Project Dashboard</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left
                ${view === item.id
                  ? 'bg-primary text-primary-content'
                  : 'text-base-content/70 hover:bg-base-300 hover:text-base-content'
                }`}
            >
              {item.icon}
              {item.label}
              {item.id === 'admin' && (
                <span className="badge badge-xs badge-primary ml-auto">Admin</span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-base-300">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="avatar placeholder flex-shrink-0">
              <div className="bg-primary/20 text-primary rounded-full w-8 flex items-center justify-center">
                <span className="text-xs font-bold leading-none">
                  {(profile?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-base-content/40 truncate">{user?.email}</p>
            </div>
          </div>
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs text-base-content/50 font-medium">Appearance</span>
            <div className="flex items-center gap-0.5 bg-base-300 rounded-lg p-0.5">
              <button
                onClick={() => { if (isDark) toggleTheme() }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  !isDark
                    ? 'bg-base-100 text-base-content shadow-sm'
                    : 'text-base-content/50 hover:text-base-content'
                }`}
                title="Light mode"
              >
                <Sun size={11} />
                Light
              </button>
              <button
                onClick={() => { if (!isDark) toggleTheme() }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  isDark
                    ? 'bg-base-100 text-base-content shadow-sm'
                    : 'text-base-content/50 hover:text-base-content'
                }`}
                title="Dark mode"
              >
                <Moon size={11} />
                Dark
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              className={`btn btn-ghost btn-xs gap-1.5 flex-1 ${refreshing ? 'loading' : ''}`}
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              {!refreshing && <RefreshCw size={12} />} Refresh
            </button>
            <button className="btn btn-ghost btn-xs gap-1.5 text-error" onClick={signOut}>
              <LogOut size={12} /> Sign out
            </button>
          </div>
          <button
            className={`btn btn-ghost btn-xs gap-1.5 w-full mt-1 ${isSSOUser ? 'opacity-40 cursor-not-allowed text-base-content/30' : 'text-base-content/60'}`}
            onClick={() => !isSSOUser && setShowChangePassword(true)}
            disabled={isSSOUser}
            title={isSSOUser ? 'Password is managed by your SSO provider' : undefined}
          >
            <Lock size={12} /> Change password
            {isSSOUser && <span className="ml-auto text-xs">SSO</span>}
          </button>
        </div>
      </aside>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {/* Main content area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-base-100/80 backdrop-blur border-b border-base-300 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-sm btn-square lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-1.5 text-sm text-base-content/50">
              <span>Delivery Tracker</span>
              <ChevronRight size={14} />
              <span className="text-base-content font-medium capitalize">
                {NAV_ITEMS.find(n => n.id === view)?.label || view}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell
              onViewAll={() => navigate('notifications')}
              onProjectOpen={(projectId, tab) => {
                const proj = projects.find(p => p.id === projectId)
                if (proj) {
                  setSelectedProjectTab(tab as any)
                  setSelectedProject(proj)
                }
              }}
            />
            {view !== 'table' && (
              <button
                className="btn btn-primary btn-sm gap-1.5 hidden sm:flex"
                onClick={() => { setEditProject(null); navigate('new-project') }}
              >
                <Plus size={14} /> New Project
              </button>
            )}
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          {/* Dashboard View */}
          {view === 'dashboard' && (
            <div className="space-y-6">
              <KPICards kpis={kpis} />
              <Charts statusCounts={statusCounts} ownerCounts={ownerCounts} />
              <div className="space-y-4">
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  options={filterOptions}
                  resultCount={filtered.length}
                  totalCount={projects.length}
                />
                <ProjectTable
                  projects={sorted.slice(0, DASHBOARD_TABLE_ROWS)}
                  sort={sort}
                  onSort={setSort}
                  onSelectProject={setSelectedProject}
                  selectedId={selectedProject?.id || null}
                  countriesMap={countriesMap}
                />
                {sorted.length > DASHBOARD_TABLE_ROWS && (
                  <div className="text-center">
                    <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => navigate('table')}>
                      View all {sorted.length} projects <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table View */}
          {view === 'table' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">All Projects</h2>
                <button
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() => { setEditProject(null); navigate('new-project') }}
                >
                  <Plus size={14} /> New Project
                </button>
              </div>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                options={filterOptions}
                resultCount={filtered.length}
                totalCount={projects.length}
              />
              <ProjectTable
                projects={sorted}
                sort={sort}
                onSort={setSort}
                onSelectProject={setSelectedProject}
                selectedId={selectedProject?.id || null}
                onEdit={handleEditProject}
                canEditProject={(p) => isAdmin || p.created_by === user?.id}
                countriesMap={countriesMap}
                statusOptions={isAdmin ? statusLookups : undefined}
                onBulkStatusUpdate={isAdmin ? handleBulkStatusUpdate : undefined}
              />
            </div>
          )}

          {/* New / Edit Project */}
          {view === 'new-project' && (
            <NewProjectPage
              editProject={editProject}
              onSaved={handleProjectSaved}
              onCancel={() => navigate(editProject ? 'table' : 'dashboard')}
            />
          )}

          {/* Import */}
          {view === 'import' && (
            <ImportPage onDone={() => { loadData(true); navigate('table') }} />
          )}

          {/* AI Insights */}
          {view === 'ai' && (
            <AIPage projects={projects} />
          )}

          {/* Notifications */}
          {view === 'notifications' && (
            <NotificationInbox
              onProjectOpen={(projectId) => {
                const proj = projects.find(p => p.id === projectId)
                if (proj) {
                  setSelectedProjectTab(undefined)
                  setSelectedProject(proj)
                  navigate('dashboard')
                }
              }}
            />
          )}

          {/* Admin */}
          {view === 'admin' && isSuperAdmin && (
            <AdminPage />
          )}
          {view === 'admin' && !isSuperAdmin && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Shield size={40} className="mx-auto text-base-content/20 mb-3" />
                <p className="text-base-content/50">Admin access required</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Project Detail Panel */}
      {selectedProject && (
        <ProjectDetail
          project={selectedProject}
          defaultTab={selectedProjectTab}
          onClose={() => { setSelectedProject(null); setSelectedProjectTab(undefined) }}
          onEdit={(isAdmin || selectedProject?.created_by === user?.id) ? () => handleEditProject(selectedProject!) : undefined}
          onStatusUpdated={(updated) => {
            setSelectedProject(updated)
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
          }}
        />
      )}
    </div>
  )
}

const AppInner: React.FC = () => {
  const { user, loading, passwordChangeRequired, isPasswordRecovery } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-primary" />
    </div>
  )
  // Handle Microsoft Entra ID OAuth callback — /auth/entra/callback
  // This path is set as the Redirect URI in the Azure App Registration.
  // The page handles code exchange + session creation, then navigates to /.
  if (window.location.pathname === '/auth/entra/callback') return <EntraCallbackPage />

  if (user && (passwordChangeRequired || isPasswordRecovery)) return <ChangePasswordPage />
  return user ? <Dashboard /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
