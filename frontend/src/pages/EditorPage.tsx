import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  ArrowLeft,
  Upload,
  Users,
  Wifi,
  WifiOff,
  FileText,
  Share2,
  CheckCircle2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  Undo,
  Redo,
  Crown,
  User as UserIcon,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { CollabCRDTProvider, CollaboratorPresence } from '../services/crdtService';
import { api } from '../services/api';

const EditorPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { theme } = useTheme();

  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [connectionState, setConnectionState] = useState<'Connected' | 'Reconnecting' | 'Offline'>('Connected');
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [showCollabDrawer, setShowCollabDrawer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState('✓ Synced');

  const isRemoteUpdateRef = useRef(false);
  const providerRef = useRef<CollabCRDTProvider | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: '<p>Loading collaborative document workspace...</p>',
    onUpdate: ({ editor }) => {
      if (isRemoteUpdateRef.current) {
        isRemoteUpdateRef.current = false;
        return;
      }
      setSaveStatus('Syncing edits...');
      providerRef.current?.broadcastUpdate(editor.getHTML(), docTitle);
      setTimeout(() => setSaveStatus('✓ Synced with collaborators'), 400);
    },
  });

  useEffect(() => {
    if (!roomId || !token || !editor) return;

    const crdt = new CollabCRDTProvider(
      roomId,
      token,
      user,
      (html, newTitle) => {
        if (newTitle && newTitle !== docTitle) {
          setDocTitle(newTitle);
        }
        if (editor.getHTML() !== html) {
          isRemoteUpdateRef.current = true;
          const { from, to } = editor.state.selection;
          editor.commands.setContent(html, false);
          try {
            const maxPos = editor.state.doc.content.size;
            editor.commands.setTextSelection({
              from: Math.min(from, maxPos),
              to: Math.min(to, maxPos),
            });
          } catch {}
          setSaveStatus('✓ Synced with collaborators');
        }
      },
      (users) => {
        setCollaborators(users);
      },
      (state) => {
        setConnectionState(state);
      },
      (newTitle) => {
        setDocTitle(newTitle);
      }
    );

    providerRef.current = crdt;

    return () => {
      crdt.destroy();
      providerRef.current = null;
    };
  }, [roomId, token, editor]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setDocTitle(newTitle);
    if (editor) {
      providerRef.current?.broadcastUpdate(editor.getHTML(), newTitle);
    }
  };

  const handleImportFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`/documents/${roomId}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.contentHtml && editor) {
        isRemoteUpdateRef.current = false;
        editor.commands.setContent(res.data.contentHtml, true);
        providerRef.current?.broadcastUpdate(res.data.contentHtml, docTitle);
      }
    } catch {}
  };

  const handleExport = async (format: string) => {
    try {
      const res = await api.post(
        `/documents/${roomId}/export`,
        { format, title: docTitle, contentHtml: editor?.getHTML() || '' },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docTitle.replace(/\s+/g, '_')}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hostUser = collaborators.find((c) => c.role === 'Host');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-5 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
            <input
              value={docTitle}
              onChange={handleTitleChange}
              className="font-bold text-sm bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none px-1 text-white placeholder-slate-500 transition"
              placeholder="Document Title"
            />
          </div>

          <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 font-mono border border-slate-700">
            {roomId}
          </span>

          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
              connectionState === 'Connected'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : connectionState === 'Reconnecting'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'Connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'Reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              }`}
            />
            <span>{connectionState}</span>
          </span>

          <span className="text-xs text-slate-400 hidden md:inline-block font-mono">
            {saveStatus}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Collaborators Toggle Button with Avatars */}
          <div className="relative">
            <button
              onClick={() => setShowCollabDrawer(!showCollabDrawer)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 transition"
              title="View all room participants"
            >
              <div className="flex -space-x-1.5 overflow-hidden">
                {collaborators.slice(0, 3).map((c) => (
                  <div
                    key={c.userId}
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 text-[10px] font-bold flex items-center justify-center text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.fullName.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>{collaborators.length} Online</span>
              </div>
            </button>

            {/* Active Participants Dropdown Panel */}
            {showCollabDrawer && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Room Participants
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                    {collaborators.length} Total
                  </span>
                </div>

                <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
                  {/* Host Box */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1.5 flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-400" />
                      Room Host / Owner
                    </span>
                    {(() => {
                      const host = collaborators.find(c => c.role === 'Host') || collaborators[0];
                      if (!host) {
                        return <div className="text-xs text-slate-500 italic p-2 rounded-xl bg-slate-950/40 border border-slate-800">Connecting host...</div>;
                      }
                      const isSelf = host.userId === user?.id;
                      return (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-amber-500/30">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ring-2 ring-amber-400/50"
                              style={{ backgroundColor: host.color }}
                            >
                              {host.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1">
                                <span>{host.fullName}</span>
                                {isSelf && <span className="text-slate-400 font-normal">(You)</span>}
                              </div>
                              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                                Host • Online
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Owner
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Collaborators Box */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-blue-400" />
                        Collaborators &amp; Members
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {collaborators.filter(c => c.role !== 'Host').length} joined
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {(() => {
                        const host = collaborators.find(c => c.role === 'Host') || collaborators[0];
                        const isViewerHost = (host && host.userId === user?.id) || ((user as any)?.role === 'Host');
                        const members = collaborators.filter(c => c !== host);
                        if (members.length === 0) {
                          return (
                            <div className="p-2.5 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                              No other collaborators joined yet
                            </div>
                          );
                        }
                        return members.map((c) => {
                          const isSelf = !isViewerHost && c.userId === user?.id;
                          return (
                            <div
                              key={c.userId}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/80"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center ring-1 ring-slate-700"
                                  style={{ backgroundColor: c.color }}
                                >
                                  {c.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div className="text-xs font-semibold text-white flex items-center gap-1">
                                  <span>{c.fullName}</span>
                                  {isSelf && <span className="text-slate-400 font-normal">(You)</span>}
                                </div>
                              </div>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                Member
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleCopyLink}
            className="text-xs px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium flex items-center gap-1.5 transition"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied' : 'Share Room'}</span>
          </button>

          <label className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer flex items-center gap-1.5 transition shadow-sm shadow-blue-500/20">
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
            <input
              type="file"
              hidden
              accept=".txt,.md,.docx,.pdf,.rtf,.html"
              onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
            />
          </label>

          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleExport(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 transition"
            >
              <option value="" disabled>Export</option>
              <option value="txt">Export .txt</option>
              <option value="md">Export .md</option>
              <option value="html">Export .html</option>
              <option value="docx">Export .docx</option>
              <option value="pdf">Export .pdf</option>
            </select>
          </div>
        </div>
      </header>

      {/* Editor Formatting Ribbon */}
      {editor && (
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-2 flex items-center gap-1.5 flex-wrap backdrop-blur">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('bold') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('italic') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('underline') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Underline"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-800 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg text-xs transition ${
              editor.isActive('bulletList') ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-800 mx-1" />
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 transition"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor Content Surface */}
      <main className="flex-1 max-w-4xl w-full mx-auto my-8 bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-12 text-slate-100 backdrop-blur-xl">
        <EditorContent editor={editor} className="prose prose-invert max-w-none focus:outline-none min-h-[500px]" />
      </main>
    </div>
  );
};

export default EditorPage;
