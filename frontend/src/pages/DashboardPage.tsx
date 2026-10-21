import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  LogIn,
  Clock,
  Copy,
  LogOut,
  Layers,
  Shield,
  Cpu,
  Database,
  Share2,
  FileText,
  Sparkles,
  ArrowRight,
  Server,
  Activity,
  UserCheck,
  Trash2,
  Users,
  Crown,
  X,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

interface RoomSummary {
  roomId: string;
  name: string;
  description?: string;
  ownerId?: string | { toString(): string };
  updatedAt: string;
}

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Management states
  const [filterTab, setFilterTab] = useState<'all' | 'owned' | 'joined'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [roomToLeave, setRoomToLeave] = useState<{ roomId: string; name: string } | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<{ roomId: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms/recent');
      setRooms(res.data.rooms || []);
    } catch {}
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const currentUserId = user?.id || (user as any)?.userId || (user as any)?._id;

  const isOwnerOfRoom = (room: RoomSummary) => {
    if (!room.ownerId || !currentUserId) return false;
    const rOwner = typeof room.ownerId === 'object' && room.ownerId !== null ? (room.ownerId as any).toString() : String(room.ownerId);
    return rOwner === String(currentUserId);
  };

  const ownedRooms = rooms.filter(isOwnerOfRoom);
  const joinedRooms = rooms.filter((r) => !isOwnerOfRoom(r));
  const displayedRooms = filterTab === 'owned' ? ownedRooms : filterTab === 'joined' ? joinedRooms : rooms;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    try {
      setCreating(true);
      const res = await api.post('/rooms', { name: roomName, description: roomDesc });
      navigate(`/room/${res.data.room.roomId}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinInput.trim().split('/').pop() || '';
    if (!cleaned) return;
    try {
      await api.post(`/rooms/${cleaned}/join`);
      navigate(`/room/${cleaned}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Room not found or access denied');
    }
  };

  // Clear all rooms the user joined as collaborator
  const handleClearAllJoined = async () => {
    try {
      setClearing(true);
      const res = await api.post('/rooms/clear-joined');
      showNotification(res.data.message || 'Successfully cleared all joined rooms.', 'success');
      setShowClearConfirm(false);
      await fetchRooms();
    } catch (err: any) {
      showNotification(err?.response?.data?.error || 'Failed to clear joined rooms.', 'error');
    } finally {
      setClearing(false);
    }
  };

  // Leave a single joined room
  const handleConfirmLeave = async () => {
    if (!roomToLeave) return;
    try {
      setActionLoading(true);
      const res = await api.post(`/rooms/${roomToLeave.roomId}/leave`);
      showNotification(res.data.message || `Left ${roomToLeave.name} successfully.`, 'success');
      setRoomToLeave(null);
      await fetchRooms();
    } catch (err: any) {
      showNotification(err?.response?.data?.error || 'Failed to leave room.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete an owned room
  const handleConfirmDelete = async () => {
    if (!roomToDelete) return;
    try {
      setActionLoading(true);
      const res = await api.delete(`/rooms/${roomToDelete.roomId}`);
      showNotification(res.data.message || `Deleted room ${roomToDelete.name}.`, 'success');
      setRoomToDelete(null);
      await fetchRooms();
    } catch (err: any) {
      showNotification(err?.response?.data?.error || 'Failed to delete room.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-extrabold flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg text-white">CollabSpace</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                Dashboard
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Multi-User Distributed CRDT Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-medium">{user?.fullName || 'Collaborator'}</span>
          </div>

          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition flex items-center gap-1.5 text-slate-300"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-10 space-y-10 flex-1">
        {/* Toast / Notification Banner */}
        {feedbackMsg && (
          <div
            className={`p-4 rounded-2xl border text-sm flex items-center justify-between gap-3 shadow-lg transition animate-in fade-in ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200 shadow-emerald-950/30'
                : 'bg-red-950/80 border-red-800 text-red-200 shadow-red-950/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <span className="font-medium">{feedbackMsg.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMsg(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Welcome Hero Banner */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Real-Time Multi-Room Hub</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.fullName || 'Collaborator'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Create a real-time collaborative document workspace or validate and join an existing room via invitation code or shareable link.
            </p>
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:block opacity-20 pointer-events-none">
            <Activity className="w-56 h-56 text-blue-500" />
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-200 text-sm flex items-center gap-3">
            <Shield className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Room Card */}
          <form onSubmit={handleCreateRoom} className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2.5 text-blue-400 font-bold text-base">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <PlusCircle className="w-5 h-5" />
              </div>
              <h2>Create a New Room</h2>
            </div>
            <p className="text-xs text-slate-400">
              Spin up a shared document workspace with instant CRDT syncing and live multi-user cursors.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Room Name (e.g. Distributed Systems RFC)"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
              />
              <input
                type="text"
                placeholder="Optional description or topic tags"
                value={roomDesc}
                onChange={(e) => setRoomDesc(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{creating ? 'Initializing Room...' : 'Create & Open Workspace'}</span>
            </button>
          </form>

          {/* Join Room Card */}
          <form onSubmit={handleJoinRoom} className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-5 hover:border-slate-700 transition">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <LogIn className="w-5 h-5" />
              </div>
              <h2>Join an Existing Room</h2>
            </div>
            <p className="text-xs text-slate-400">
              Connect to an active session using an invitation link or alphanumeric Room ID.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Paste Room ID (e.g. CS-849201) or invite URL"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
              />
              <div className="text-[11px] text-slate-500">
                Tip: Room links look like <code className="text-slate-400">/room/CS-123456</code>
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Validate &amp; Join Session</span>
            </button>
          </form>
        </div>

        {/* Recently Accessed Rooms */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2.5 text-white">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>Recently Accessed Rooms</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage workspaces you own or collaborate in
              </p>
            </div>

            {/* Action Bar: Clear Joined Rooms + Count */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {joinedRooms.length > 0 && (
                <button
                  type="button"
                  id="btnClearAllJoinedRooms"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={clearing}
                  className="px-3.5 py-1.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center gap-2 transition shadow-sm shadow-red-950/20 disabled:opacity-50"
                  title="Leave and clear all rooms you have joined as a collaborator"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Clear Joined Rooms ({joinedRooms.length})</span>
                </button>
              )}

              <span className="text-xs text-slate-400 font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                {rooms.length} room{rooms.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          {rooms.length > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                onClick={() => setFilterTab('all')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  filterTab === 'all'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                All Rooms ({rooms.length})
              </button>
              <button
                onClick={() => setFilterTab('owned')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  filterTab === 'owned'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Created by You ({ownedRooms.length})</span>
              </button>
              <button
                onClick={() => setFilterTab('joined')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  filterTab === 'joined'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Users className="w-3 h-3 text-emerald-400" />
                <span>Joined as Collaborator ({joinedRooms.length})</span>
              </button>
            </div>
          )}

          {displayedRooms.length === 0 ? (
            <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-300">
                {filterTab === 'joined'
                  ? 'No joined rooms found. You have cleared or not yet joined any rooms.'
                  : filterTab === 'owned'
                  ? 'You have not created any rooms yet.'
                  : 'No rooms found. Create or join your first room above!'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {filterTab === 'joined'
                  ? 'When you join a workspace via invite link or room ID, it will be listed here.'
                  : 'Get started by creating a collaborative room or pasting an invite link above.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {displayedRooms.map((r) => {
                const isOwner = isOwnerOfRoom(r);
                return (
                  <div
                    key={r.roomId}
                    onClick={() => navigate(`/room/${r.roomId}`)}
                    className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-850 cursor-pointer transition shadow-sm group flex flex-col justify-between space-y-3"
                  >
                    <div>
                      {/* Top Bar: Badge and Action */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                            isOwner
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {isOwner ? (
                            <>
                              <Crown className="w-3 h-3 text-amber-400" />
                              <span>Host</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-3 h-3 text-emerald-400" />
                              <span>Collaborator</span>
                            </>
                          )}
                        </span>

                        <div className="flex items-center gap-1">
                          {isOwner ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRoomToDelete({ roomId: r.roomId, name: r.name });
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                              title="Delete room"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRoomToLeave({ roomId: r.roomId, name: r.name });
                              }}
                              className="px-2 py-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition flex items-center gap-1 text-[11px] font-medium"
                              title="Leave this joined room"
                            >
                              <LogOut className="w-3 h-3" />
                              <span>Leave</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white group-hover:text-blue-400 transition truncate">
                          {r.name}
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition shrink-0 ml-2" />
                      </div>

                      {r.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{r.description}</p>
                      )}

                      <div className="text-xs font-mono text-slate-500 mt-1.5">ID: {r.roomId}</div>
                    </div>

                    <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span>Edited: {new Date(r.updatedAt).toLocaleDateString()}</span>
                      <span className="text-blue-400 text-[11px] group-hover:underline">Open &rarr;</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Modal: Confirm Clear All Joined Rooms */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Clear All Joined Rooms</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Are you sure you want to clear all <strong className="text-white">{joinedRooms.length} room{joinedRooms.length > 1 ? 's' : ''}</strong> you have joined?
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <p>• You will be removed as a collaborator from each joined room.</p>
                <p>• They will be removed from your Recently Accessed list.</p>
                <p className="text-emerald-400">• Rooms created and owned by you will not be touched.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={clearing}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btnConfirmClearAllJoined"
                  onClick={handleClearAllJoined}
                  disabled={clearing}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {clearing ? (
                    <span>Clearing...</span>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Yes, Clear All Joined Rooms</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Leave Single Room */}
        {roomToLeave && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Leave Room</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Leave workspace <strong className="text-white">"{roomToLeave.name}"</strong> ({roomToLeave.roomId})? You can always rejoin later with the invitation link.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRoomToLeave(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLeave}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? 'Leaving...' : 'Yes, Leave Room'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Delete Room */}
        {roomToDelete && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Delete Workspace</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Are you sure you want to permanently delete <strong className="text-white">"{roomToDelete.name}"</strong>? All associated notes and document content will be removed.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRoomToDelete(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? 'Deleting...' : 'Delete Workspace'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* System Architecture Flow Diagram */}
        <section className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">System Architecture &amp; Data Pipeline</h3>
              <p className="text-xs text-slate-400">Multi-layer distributed synchronization stack</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs">
                01
              </div>
              <div className="text-xs font-bold text-white">User Clients</div>
              <p className="text-[11px] text-slate-400">Multi-session authenticated browsers</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
                02
              </div>
              <div className="text-xs font-bold text-white">React Frontend</div>
              <p className="text-[11px] text-slate-400">TipTap rich-text &amp; OGL WebGL core</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">
                03
              </div>
              <div className="text-xs font-bold text-white">Express API</div>
              <p className="text-[11px] text-slate-400">JWT security &amp; room access controls</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                04
              </div>
              <div className="text-xs font-bold text-white">Socket.IO</div>
              <p className="text-[11px] text-slate-400">Full-duplex low latency websocket channel</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs">
                05
              </div>
              <div className="text-xs font-bold text-white">Yjs CRDT</div>
              <p className="text-[11px] text-slate-400">Deterministic conflict-free state merging</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="w-8 h-8 mx-auto rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xs">
                06
              </div>
              <div className="text-xs font-bold text-white">MongoDB</div>
              <p className="text-[11px] text-slate-400">Persistent CRDT states &amp; document storage</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DashboardPage;
