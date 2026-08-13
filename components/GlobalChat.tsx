'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';

interface Profile {
  id: string;
  nama: string;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  is_edited: boolean;
  created_at: string;
  profiles: {
    nama: string;
    avatar_url: string | null;
  };
}

interface OnlineUser {
  presence_ref: string;
  id: string;
  nama: string;
  avatar_url: string | null;
  joined_at: string;
  // Bouncing Animation Configs (Randomized per user)
  durationX: string;
  durationY: string;
  delayX: string;
  delayY: string;
}

export default function GlobalChat({ profile }: { profile: Profile | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mention State
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Load initial messages and profiles
  useEffect(() => {
    const fetchMessagesAndProfiles = async () => {
      // Fetch messages
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          id, user_id, message, is_edited, created_at,
          profiles ( nama, avatar_url )
        `)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (!error && data) {
        setMessages(data as any[]);
      }

      // Fetch profiles for mentions
      const { data: profilesData } = await supabase.from('profiles').select('id, nama, avatar_url');
      if (profilesData) setAllProfiles(profilesData);
    };
    fetchMessagesAndProfiles();
  }, []);

  // Presence & Chat Realtime Listener
  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel('global_chat_room', {
      config: {
        presence: {
          key: profile.id,
        },
      },
    });

    // Handle Presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users: OnlineUser[] = [];
      
      // Mengubah object state menjadi array online users yang unique
      Object.values(state).forEach((presences: any) => {
        presences.forEach((presence: any) => {
          // Hanya tambahkan jika belum ada di list (berdasarkan user ID), 
          // untuk mencegah duplikat kalau 1 user buka banyak tab
          if (!users.find(u => u.id === presence.id)) {
             // Generate random animation values for bouncing
             const durationX = (Math.random() * 5 + 10).toFixed(2) + 's'; // 10s - 15s
             const durationY = (Math.random() * 3 + 6).toFixed(2) + 's';  // 6s - 9s
             const delayX = '-' + (Math.random() * 10).toFixed(2) + 's';
             const delayY = '-' + (Math.random() * 10).toFixed(2) + 's';
             
             users.push({
                ...presence,
                durationX,
                durationY,
                delayX,
                delayY
             });
          }
        });
      });
      setOnlineUsers(users);
    });

    // Handle Realtime Chat Messages
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages' },
      async (payload) => {
        if (payload.eventType === 'INSERT') {
          // Fetch profile for the new message
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('nama, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const newMsg = {
            ...payload.new,
            profiles: userProfile || { nama: 'Unknown', avatar_url: null }
          } as ChatMessage;

          setMessages(prev => [...prev, newMsg]);
        }
        else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
        else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, message: payload.new.message, is_edited: payload.new.is_edited } : m));
        }
      }
    );

    // Subscribe and emit presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          id: profile.id,
          nama: profile.nama,
          avatar_url: profile.avatar_url,
          joined_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    
    // Autocomplete Logic
    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

    if (lastAtMatch) {
      setShowMentions(true);
      setMentionQuery(lastAtMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const handleSelectMention = (nama: string) => {
    const cursor = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = newMessage.slice(0, cursor);
    const textAfterCursor = newMessage.slice(cursor);
    
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
    if (lastAtMatch) {
       const replaceStart = textBeforeCursor.lastIndexOf('@');
       const newText = newMessage.slice(0, replaceStart) + `@${nama} ` + textAfterCursor;
       setNewMessage(newText);
       setShowMentions(false);
       inputRef.current?.focus();
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    setIsSending(true);
    const { error } = await supabase.from('chat_messages').insert({
      user_id: profile.id,
      message: newMessage.trim(),
    });

    if (!error) {
      setNewMessage('');
    } else {
      console.error(error);
      alert('Gagal mengirim pesan.');
    }
    setIsSending(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus pesan ini?')) {
       await supabase.from('chat_messages').delete().eq('id', id);
    }
  };

  return (
    <>
      {/* ==============================================
          FLOATING BUBBLES (ONLINE USERS)
          ============================================== */}
      <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
        {onlineUsers.map(user => (
          <div
            key={user.id}
            className="absolute left-0 top-0 will-change-transform"
            style={{
              animation: `bounceX ${user.durationX} linear infinite alternate`,
              animationDelay: user.delayX,
              // Start slightly lower in the screen
              transform: 'translateY(80vh)', 
            }}
          >
            <div
              className="will-change-transform shadow-lg rounded-full border-2 border-white/50 backdrop-blur-sm"
              style={{
                animation: `bounceY ${user.durationY} ease-in-out infinite alternate`,
                animationDelay: user.delayY,
              }}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.nama} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center font-bold text-white text-xs border border-white">
                  {user.nama.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Online Indicator Dot */}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* ==============================================
          CHAT WIDGET TOGGLE BUTTON
          ============================================== */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-2xl transition-all transform hover:scale-110 active:scale-95 group"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <div className="relative">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
        )}
      </button>

      {/* ==============================================
          CHAT WIDGET PANEL
          ============================================== */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 h-96 bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex justify-between items-center shadow-md z-10">
            <div>
              <h3 className="font-black text-sm">Grup Obrolan Mabar</h3>
              <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                {onlineUsers.length} Online Sekarang
              </p>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar relative">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-medium opacity-70">
                <span className="text-3xl mb-2">💬</span>
                Belum ada obrolan.
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.user_id === profile?.id;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} group`}>
                    <img 
                      src={msg.profiles.avatar_url || `https://ui-avatars.com/api/?name=${msg.profiles.nama}&background=random`} 
                      alt="avatar" 
                      className="w-6 h-6 rounded-full object-cover shadow-sm mt-1"
                    />
                    <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && <span className="text-[9px] font-bold text-slate-500 mb-0.5 ml-1">{msg.profiles.nama}</span>}
                      
                      <div className="relative group/msg">
                        <div className={`px-3 py-2 text-xs shadow-sm rounded-2xl ${
                          isMe 
                            ? 'bg-amber-500 text-white rounded-tr-none' 
                            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                        }`}>
                          {msg.message}
                          {msg.is_edited && <span className="text-[8px] opacity-60 ml-2 italic">(diedit)</span>}
                        </div>

                        {/* Delete Button (Only for me) */}
                        {isMe && (
                          <button 
                            onClick={() => handleDelete(msg.id)}
                            className="absolute top-1 -left-7 p-1 text-rose-500 opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-rose-10 rounded-full"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                      <span className="text-[8px] text-slate-400 mt-1">{new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 z-10 relative">
            
            {/* MENTION POPOVER */}
            {showMentions && (
              <div className="absolute bottom-full left-0 w-full bg-white border-t border-slate-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] max-h-40 overflow-y-auto z-20">
                {allProfiles
                  .filter(p => p.nama.toLowerCase().includes(mentionQuery))
                  .map((p) => (
                   <div 
                     key={p.id}
                     onClick={() => handleSelectMention(p.nama)}
                     className="p-2 flex items-center gap-2 cursor-pointer hover:bg-amber-50 border-b border-slate-50 last:border-0"
                   >
                     {p.avatar_url ? (
                        <img src={p.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                     ) : (
                        <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-[9px] font-bold">
                          {p.nama.charAt(0).toUpperCase()}
                        </div>
                     )}
                     <span className="text-xs font-bold text-slate-700">{p.nama}</span>
                   </div>
                ))}
              </div>
            )}

            <div className="relative flex items-center">
              <input 
                ref={inputRef}
                type="text" 
                value={newMessage}
                onChange={handleInputChange}
                placeholder="Ketik pesan..." 
                className="w-full bg-slate-100 text-xs text-slate-800 rounded-full py-2.5 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim() || isSending}
                className="absolute right-1 p-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-full transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </form>

        </div>
      )}
    </>
  );
}
