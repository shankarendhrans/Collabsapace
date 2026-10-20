import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Palette,
  BookOpen,
  Download,
  Sparkles,
  Zap,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CrystalizedBall from '../components/CrystalizedBall';

const PRESETS = [
  { id: 'plasma', label: 'Plasma', color: '#F25BD0' },
  { id: 'aurora', label: 'Aurora', color: '#5CFFC8' },
  { id: 'nebula', label: 'Nebula', color: '#9478FF' },
  { id: 'solar', label: 'Solar', color: '#FFD36E' },
  { id: 'ember', label: 'Ember', color: '#FF8A2A' },
  { id: 'abyss', label: 'Abyss', color: '#3F7BFF' }
] as const;

type PresetKey = typeof PRESETS[number]['id'];

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [currentPreset, setCurrentPreset] = useState<PresetKey>('plasma');
  const [ballInteractive, setBallInteractive] = useState(true);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    try {
      setSubmitting(true);
      if (mode === 'login') {
        await login(identifier, password, rememberMe);
      } else {
        await register(fullName, email, username, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="max-w-7xl w-full mx-auto px-6 py-5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">CollabSpace</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                v3.0 Real-Time
              </span>
            </div>
            <p className="text-xs text-slate-400">Collaborative Editor, File Projector &amp; Live Sketch Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-2 text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Yjs CRDT Sync Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center my-auto">
        {/* Left Hero Column with CrystalizedBall Showcase */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/20 text-blue-300">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Interactive WebGL Workspace Engine</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-white">
            Real-time notes, live sketch, and visual file projection.
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl">
            Upload PDFs, Word docs, and research papers onto the dedicated reference screen while co-authoring formatted notes and sketching live with teammates in lockstep.
          </p>

          {/* CrystalizedBall Visual Canvas Card */}
          <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 p-4 shadow-2xl backdrop-blur-xl overflow-hidden group">
            <div className="flex items-center justify-between pb-3 px-2 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Crystalized Energy Core
                </span>
                <span className="text-[10px] text-slate-500 font-mono">React Bits • OGL WebGL</span>
              </div>

              {/* Preset Selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setCurrentPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      currentPreset === p.id
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700/80'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ball Canvas viewport */}
            <div className="relative w-full h-[320px] sm:h-[380px] rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center">
              <CrystalizedBall
                preset={currentPreset}
                size={0.78}
                crackle={0.85}
                fill={0.55}
                glow={1.1}
                interactive={ballInteractive}
                hoverStrength={0.75}
                speed={1.05}
                dustSpeed={1.1}
                className="w-full h-full"
              />

              <div className="absolute bottom-3 left-3 text-[11px] text-slate-400 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full border border-slate-800/80 pointer-events-none flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Move cursor to stir dust &amp; flare rim • Click inside to shockwave</span>
              </div>
            </div>
          </div>

          {/* 4 Feature Pills with clean SVG icons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-blue-500/40 transition">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Full-Format File Projector</div>
                <p className="text-xs text-slate-400 mt-0.5">Project PDFs, Word docs, and slides in pixel-exact visual fidelity.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-purple-500/40 transition">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Live Paint &amp; Cursor Sketch</div>
                <p className="text-xs text-slate-400 mt-0.5">Draw freehand, circle formulas, and underline notes over documents.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-emerald-500/40 transition">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Split-Screen Teaching Mode</div>
                <p className="text-xs text-slate-400 mt-0.5">Present reference material on the left while drafting notes on the right.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-amber-500/40 transition">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Multi-Format Instant Export</div>
                <p className="text-xs text-slate-400 mt-0.5">Download your combined workspace as .docx, .pdf, .html, .md, or .txt.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Column */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
            {/* Mode Tabs */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition ${
                  mode === 'login' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition ${
                  mode === 'register' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'login' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email or Username</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                      placeholder="demo@collabspace.io or username"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                        placeholder="Ada Lovelace"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                        placeholder="ada@collabspace.io"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                        placeholder="adalovelace"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
                      placeholder="Confirm password"
                    />
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                    />
                    Remember my session
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In to Workspace' : 'Create CollabSpace Account'}</span>
              </button>
            </form>

            <div
              onClick={() => {
                setMode('login');
                setIdentifier('demo@collabspace.io');
                setPassword('CollabSpace123');
                setError('');
              }}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center cursor-pointer hover:border-blue-500/50 hover:bg-slate-900/60 transition group"
              title="Click to auto-fill demo credentials"
            >
              <span className="text-[11px] text-slate-400 group-hover:text-slate-300">
                Quick Demo (Click to autofill): <code className="text-blue-400 font-mono">demo@collabspace.io</code> / <code className="text-blue-400 font-mono">CollabSpace123</code>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl w-full mx-auto px-6 py-5 border-t border-slate-800/80 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <span>&copy; 2026 CollabSpace — High-Performance Distributed Real-Time Workspace</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Layers className="w-3.5 h-3.5 text-blue-400" /> WebGL Powered
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Zap className="w-3.5 h-3.5 text-emerald-400" /> Conflict-Free CRDT
          </span>
        </div>
      </footer>
    </div>
  );
};

export default AuthPage;
