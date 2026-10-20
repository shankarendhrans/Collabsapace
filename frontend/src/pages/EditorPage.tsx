import React, { useEffect, useState } from 'react';
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
  Download,
  Users,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  FileText,
  Share2,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { CollabCRDTProvider, CollaboratorPresence } from '../services/crdtService';
import { api } from '../services/api';

const EditorPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [connectionState, setConnectionState] = useState<'Connected' | 'Reconnecting' | 'Offline'>('Connected');
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [provider, setProvider] = useState<CollabCRDTProvider | null>(null);
  const [copied, setCopied] = useState(false);

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
      provider?.broadcastUpdate(editor.getHTML(), docTitle);
    },
  });

  useEffect(() => {
    if (!roomId || !token || !editor) return;
    const crdt = new CollabCRDTProvider(
      roomId,
      token,
      (html) => {
        if (editor.getHTML() !== html) {
          editor.commands.setContent(html, false);
        }
      },
      (users) => setCollaborators(users),
      (state) => setConnectionState(state)
    );
    setProvider(crdt);
    return () => crdt.destroy();
  }, [roomId, token, editor]);

  const handleImportFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`/documents/${roomId}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.contentHtml && editor) {
        editor.commands.setContent(res.data.contentHtml, true);
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
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
              onChange={(e) => setDocTitle(e.target.value)}
              className="font-bold text-sm bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none px-1 text-white placeholder-slate-500 transition"
              placeholder="Document Title"
            />
          </div>

          <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 font-mono border border-slate-700">
            {roomId}
          </span>

          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{connectionState}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyLink}
            className="text-xs px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium flex items-center gap-1.5 transition"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied' : 'Share Room'}</span>
          </button>

          <label className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer flex items-center gap-1.5 transition shadow-sm shadow-blue-500/20">
            <Upload className="w-3.5 h-3.5" />
            <span>Import File</span>
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
              <option value="" disabled>Export Document</option>
              <option value="txt">Export .txt</option>
              <option value="md">Export .md</option>
              <option value="html">Export .html</option>
              <option value="docx">Export .docx</option>
              <option value="pdf">Export .pdf</option>
            </select>
          </div>
        </div>
      </header>

      {/* Editor Content Surface */}
      <main className="flex-1 max-w-4xl w-full mx-auto my-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-12 text-slate-100">
        <EditorContent editor={editor} className="prose prose-invert max-w-none focus:outline-none" />
      </main>
    </div>
  );
};

export default EditorPage;
