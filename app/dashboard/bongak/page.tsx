'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';

export default function BongakPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllProfiles();
  }, []);

  const fetchAllProfiles = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('profiles').select('*').order('nama', { ascending: true });
    const { data: tData } = await supabase.from('tagihan').select('ke_user_id, nominal');

    if (pData) setProfiles(pData);
    
    // Hitung talangan untuk Gamifikasi
    if (tData) {
      const talanganMap: Record<string, number> = {};
      tData.forEach(t => {
        talanganMap[t.ke_user_id] = (talanganMap[t.ke_user_id] || 0) + Number(t.nominal);
      });
      setStats(talanganMap);
    }
    setLoading(false);
  };

  // 📱 LOGIKA GELAR BERDASARKAN PERILAKU (TALANGAN)
  const getDinamisBadge = (personId: string, name: string) => {
    const totalTalangan = stats[personId] || 0;
    if (totalTalangan > 1000000) return { label: 'Maha Pahlawan 👑', css: 'bg-amber-100 text-amber-700 border-amber-300' };
    if (totalTalangan > 500000) return { label: 'Donatur Tetap 💎', css: 'bg-blue-100 text-blue-700 border-blue-300' };
    
    // Fallback ke badge unik berdasarkan nama jika data talangan sedikit
    const charSum = (name || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const badges = [
      { label: 'Intel Gosip 🕵️‍♂️', css: 'bg-purple-50 text-purple-600 border-purple-100' },
      { label: 'Kang Wacana 💬', css: 'bg-orange-50 text-orange-600 border-orange-100' },
      { label: 'Sapu Jagat 🍽️', css: 'bg-teal-50 text-teal-700 border-teal-100' }
    ];
    return badges[charSum % badges.length];
  };

  // 📱 AUTOMATIC PHONE FORMATTER (Memastikan selalu berawalan '0')
  const formatDisplayPhone = (num: string) => {
    if (!num) return '-';
    let cleaned = num.trim();
    
    if (cleaned.startsWith('+62')) {
      return '0' + cleaned.substring(3);
    }
    if (cleaned.startsWith('62')) {
      return '0' + cleaned.substring(2);
    }
    if (!cleaned.startsWith('0')) {
      return '0' + cleaned;
    }
    return cleaned;
  };

  // 👑 DAFTAR GELAR TONGKRONGAN (Diberikan otomatis & konsisten berdasarkan nama)
  // 👑 DAFTAR GELAR TONGKRONGAN (Diberikan otomatis & konsisten berdasarkan nama)
const getTongkronganBadge = (name: string) => {
  const badges = [
    // --- GELAR LAMA ---
    { label: 'Buronan Patungan 💸', css: 'bg-rose-50 text-rose-600 border-rose-100' },
    { label: 'Donatur Tetap 👑', css: 'bg-amber-50 text-amber-700 border-amber-100' },
    { label: 'Suhu Sepuh 🧎‍♂️', css: 'bg-purple-50 text-purple-600 border-purple-100' },
    { label: 'Intel Gosip 🕵️‍♂️', css: 'bg-blue-50 text-blue-600 border-blue-100' },
    { label: 'Beban Tongkrongan 🎒', css: 'bg-slate-100 text-slate-600 border-slate-200' },
    { label: 'Menteri Hiburan 🎸', css: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    
    // --- GELAR BARU ---
    { label: 'Kang Wacana 💬', css: 'bg-orange-50 text-orange-600 border-orange-100' },
    { label: 'Raja Telat 🐢', css: 'bg-red-50 text-red-600 border-red-100' },
    { label: 'Sapu Jagat Makanan 🍽️', css: 'bg-teal-50 text-teal-700 border-teal-100' },
    { label: 'Bandar Dadakan 🏧', css: 'bg-lime-50 text-lime-700 border-lime-100' },
    { label: 'Si Paling Sibuk 🌪️', css: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
    { label: 'Kang Ghosting 👻', css: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    { label: 'Ahli Nego Harga 🤝', css: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
    { label: 'Penikmat Gratisan 🎯', css: 'bg-pink-50 text-pink-600 border-pink-100' },
    { label: 'Seksi Repot 🛠️', css: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100' },
    { label: 'Tukang Tepar Duluan 😴', css: 'bg-sky-50 text-sky-600 border-sky-100' }
  ];

  // Menggunakan nama sebagai pengacak instan agar gelarnya tidak berubah-ubah
  const charSum = (name || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const index = charSum % badges.length;
  
  // 👇 INI BARIS YANG HILANG BWANG (Wajib ada biar datanya dikirim ke komponen)
  return badges[index]; 
};

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
      
      {/* HEADER - SEKARANG PARA BONGAKS */}
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-black text-slate-950 tracking-tight">🤪 PARA BONGAKS</h1>
        <p className="text-slate-500 text-sm mt-1">Daftar personil lengkap beserta nomor rekening buat patungan jajan.</p>
      </div>

      {/* LOADING STATE */}
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <span className="text-amber-500 font-bold animate-pulse text-lg">Memanggil para personil... 📡</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <span className="text-6xl mb-4 block">🏜️</span>
          <h3 className="text-xl font-bold text-slate-700">Tongkrongan Sepi!</h3>
          <p className="text-slate-500 text-sm mt-2">Belum ada anggota yang terdaftar di sistem.</p>
        </div>
      ) : (
        /* GRID CARD ANGGOTA */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {profiles.map((person) => {
            const badge = getDinamisBadge(person.id, person.nama);
            const hasPIC = person.sponsor_utama_id;
            const picProfile = profiles.find(p => p.id === person.sponsor_utama_id);

            return (
              <div 
                key={person.id} 
                className={`bg-white p-5 rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col relative overflow-hidden group ${hasPIC ? 'ring-2 ring-pink-200 border-pink-100' : 'border-slate-100'}`}
              >
                {/* Garis Aksen Keren di atas Card */}
                <div className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${hasPIC ? 'from-pink-500 via-rose-400 to-pink-500 animate-gradient-x' : 'from-amber-400 to-amber-600'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                
                {hasPIC && (
                  <div className="absolute -right-8 -top-1 bg-gradient-to-r from-pink-600 to-rose-500 text-white text-[8px] font-black px-10 py-2 rotate-45 shadow-lg z-10">
                    PARTNER IN CRIME
                  </div>
                )}
                
                {/* Bagian Atas: Avatar & Nama */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center font-black text-slate-400 text-xl shadow-inner relative">
                    {person.avatar_url ? (
                      <img src={person.avatar_url} alt={person.nama} className="w-full h-full object-cover" />
                    ) : (
                      (person.nama || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-slate-900 truncate flex items-center gap-1">
                      {person.nama || 'Tanpa Nama'}
                      {hasPIC && <span className="text-pink-500 text-xs">💞</span>}
                    </h3>
                    
                    {/* STATUS ALA TONGKRONGAN (OTOMATIS) */}
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1 ${badge.css}`}>
                      {badge.label}
                    </div>
                  </div>
                </div>

                {hasPIC && picProfile && (
                  <div className="mb-4 p-3 bg-gradient-to-br from-pink-50 to-white rounded-2xl border border-pink-100 flex items-center gap-3 shadow-inner relative overflow-hidden">
                    <div className="absolute right-0 top-0 opacity-10 text-2xl">🔗</div>
                    <div className="w-8 h-8 rounded-full bg-pink-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-pink-700 border border-white">
                      {picProfile.avatar_url ? <img src={picProfile.avatar_url} className="rounded-full h-full w-full object-cover" /> : picProfile.nama.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] font-black text-pink-400 uppercase tracking-tighter">Criminal Partner</p>
                      <p className="text-xs font-bold text-slate-700 truncate">{picProfile.nama}</p>
                    </div>
                  </div>
                )}

                {/* Bagian Bawah: Informasi Detail */}
                <div className="space-y-3 bg-slate-50 rounded-2xl p-4 border border-slate-100 flex-1">
                  
                  {/* Info Kontak dengan Auto-Zero Fix */}
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Kontak Personil</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2 truncate">
                      📱 {formatDisplayPhone(person.no_hp)}
                    </p>
                    <p className="text-xs font-medium text-slate-500 flex items-center gap-2 truncate mt-0.5">
                      📧 {person.email || '-'}
                    </p>
                  </div>

                  <div className="h-px bg-slate-200 w-full"></div>

                  {/* Info Bank/Rekening */}
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Rekening Lapak / Transfer</p>
                    <div className="flex justify-between items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-amber-700 truncate">{person.nama_bank || 'Mager Isi Bank'}</p>
                        <p className="text-xs font-mono font-bold text-slate-600 truncate mt-0.5">{person.no_rekening || 'xxx-xxx-xxx'}</p>
                      </div>
                      
                      {/* Tombol Copy Rekening */}
                      {person.no_rekening && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(person.no_rekening);
                            alert(`Rekening ${person.nama} berhasil di-copy! Siap di-transfer 🚀`);
                          }}
                          className="p-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors flex-shrink-0 active:scale-90"
                          title="Salin Nomor Rekening"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}