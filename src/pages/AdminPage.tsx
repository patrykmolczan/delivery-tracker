import React, { useState, useEffect } from 'react'
import { UserPlus, Shield, User, CheckCircle2, Edit2, Save, X, AlertCircle, Loader2, RefreshCw, Key } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [newUser, setNewUser] = useState({ email: '', full_name: '', password: '', role: 'user' as 'admin' | 'user' })
  const [editForm, setEditForm] = useState({ full_name: '', role: 'user' as 'admin' | 'user', is_active: true })

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setUsers(data as UserProfile[])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUser.email || !newUser.password || !newUser.full_name) return
    setCreating(true)
    setError(null)
    try {
      // Use Supabase admin API via RPC
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: newUser.email,
        p_password: newUser.password,
        p_full_name: newUser.full_name,
        p_role: newUser.role,
      })
      if (error) throw error
      setNewUser({ email: '', full_name: '', password: '', role: 'user' })
      await fetchUsers()
      showSuccess(`User ${newUser.email} created successfully!`)
    } catch (err: any) {
      setError(err.message || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (user: UserProfile) => {
    setEditId(user.id)
    setEditForm({ full_name: user.full_name, role: user.role, is_active: user.is_active ?? true })
  }

  const cancelEdit = () => {
    setEditId(null)
  }

  const saveEdit = async (id: string) => {
    setError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          role: editForm.role,
          is_active: editForm.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      setEditId(null)
      await fetchUsers()
      showSuccess('User updated successfully!')
    } catch (err: any) {
      setError(err.message || 'Failed to update user')
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={22} className="text-primary" /> User Management
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">Create and manage user accounts and permissions</p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={fetchUsers}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Create User Form */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body">
          <h3 className="card-title text-base flex items-center gap-2">
            <UserPlus size={18} className="text-primary" /> Create New User
          </h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Full Name <span className="text-error">*</span></span></label>
              <input
                className="input input-bordered input-sm"
                placeholder="Jane Smith"
                value={newUser.full_name}
                onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Email <span className="text-error">*</span></span></label>
              <input
                type="email"
                className="input input-bordered input-sm"
                placeholder="jane@company.com"
                value={newUser.email}
                onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                required
              />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Password <span className="text-error">*</span></span></label>
              <input
                type="password"
                className="input input-bordered input-sm"
                placeholder="Min. 8 characters"
                value={newUser.password}
                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                minLength={8}
                required
              />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Role</span></label>
              <div className="flex gap-2">
                <select
                  className="select select-bordered select-sm flex-1"
                  value={newUser.role}
                  onChange={e => setNewUser(u => ({ ...u, role: e.target.value as any }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  className={`btn btn-primary btn-sm gap-1.5 ${creating ? 'loading' : ''}`}
                  disabled={creating}
                >
                  {!creating && <UserPlus size={14} />}
                  {creating ? '…' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Users Table */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr className="bg-base-300/50">
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="avatar placeholder">
                            <div className="bg-primary/20 text-primary rounded-full w-8">
                              <span className="text-xs font-bold">{user.full_name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}</span>
                            </div>
                          </div>
                          {editId === user.id ? (
                            <input
                              className="input input-bordered input-xs w-32"
                              value={editForm.full_name}
                              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                            />
                          ) : (
                            <span className="font-medium">{user.full_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-base-content/70">{user.email}</td>
                      <td>
                        {editId === user.id ? (
                          <select
                            className="select select-bordered select-xs"
                            value={editForm.role}
                            onChange={e => setEditForm(f => ({ ...f, role: e.target.value as any }))}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className={`badge badge-sm ${user.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`}>
                            {user.role === 'admin' ? <><Shield size={10} className="mr-1" />Admin</> : <><User size={10} className="mr-1" />User</>}
                          </span>
                        )}
                      </td>
                      <td>
                        {editId === user.id ? (
                          <input
                            type="checkbox"
                            className="toggle toggle-success toggle-sm"
                            checked={editForm.is_active}
                            onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                          />
                        ) : (
                          <span className={`badge badge-sm ${user.is_active ? 'badge-success' : 'badge-error'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-base-content/50">
                        {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {editId === user.id ? (
                            <>
                              <button className="btn btn-success btn-xs gap-1" onClick={() => saveEdit(user.id)}>
                                <Save size={12} /> Save
                              </button>
                              <button className="btn btn-ghost btn-xs" onClick={cancelEdit}><X size={12} /></button>
                            </>
                          ) : (
                            <button className="btn btn-ghost btn-xs gap-1" onClick={() => startEdit(user)}>
                              <Edit2 size={12} /> Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Note about OKTA */}
      <div className="alert bg-base-200 border border-base-300">
        <Key size={18} className="text-primary" />
        <div>
          <p className="font-semibold text-sm">OKTA SSO Ready</p>
          <p className="text-xs text-base-content/60">
            This auth system is architected to support OKTA SSO via OAuth2/OIDC. When ready, configure the OKTA provider in Supabase Auth settings — no code changes required.
          </p>
        </div>
      </div>
    </div>
  )
}
