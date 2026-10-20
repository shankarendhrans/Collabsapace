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
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

interface RoomSummary {
  roomId: string;
  name: string;
  description?: string;
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

  useEffect(() => {
    api.get('/rooms/recent').then((res) => setRooms(res.data.rooms || [])).catch(() => {});
  }, []);

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
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2.5 text-white">
              <Clock className="w-5 h-5 text-blue-400" />
              <span>Recently Accessed Rooms</span>
            </h3>
            <span className="text-xs text-slate-500">{rooms.length} rooms listed</span>
          </div>

          {rooms.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-sm">
              No recent rooms found. Create your first collaborative workspace above!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rooms.map((r) => (
                <div
                  key={r.roomId}
                  onClick={() => navigate(`/room/${r.roomId}`)}
                  className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-850 cursor-pointer transition shadow-sm group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white group-hover:text-blue-400 transition">{r.name}</span>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition" />
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">ID: {r.roomId}</div>
                  <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800">
                    Last edited: {new Date(r.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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
