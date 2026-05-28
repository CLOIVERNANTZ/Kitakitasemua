'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// --- INTERFACE DATA ---
interface SesiJajan { id: string; nama: string; tanggal: string; warung: string; total: number; }
interface UserProfile { id: string; nama: string; nama_bank?: string; no_rekening?: string; }
interface StatusTransfer { id: string; id_sesi: string; dari_user_id: string; ke_user_id: string; nominal: number; status: 'Belum Bayar' | 'Menunggu Konfirmasi' | 'Lunas'; bukti_url?: string; }

export default function RiwayatJajanPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [daftarSesi, setDaftarSesi] = useState<SesiJajan[]>([]);
  const [sesiTerpilih, setSesiTerpilih] = useState<string | null>(null);
  
  const [transfers, setTransfers] = useState<StatusTransfer[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    const fetchData = async () => {
      // 1. Ambil User Asli
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      // 2. Ambil Profil Asli dari DB
      const { data: profilesData } = await supabase.from('profiles').select('*');
      if (profilesData) setProfiles(profilesData as UserProfile[]);

      // 3. Ambil Sesi (events)
      const { data: events } = await supabase.from('events').select('*').order('created_at', { ascending: false });
      if (events) setDaftarSesi(events.map(e => ({ 
        id: e.id, nama: e.nama_acara, tanggal: e.tanggal, 
        warung: e.tipe_acara || 'Acara', total: e.total_biaya 
      })));

      // 4. Ambil Tagihan
      const { data: tagihan } = await supabase.from('tagihan').select('*');
      if (tagihan) setTransfers(tagihan.map(t => ({
        id: t.id, id_sesi: t.event_id, dari_user_id: t.dari_user_id,
        ke_user_id: t.ke_user_id, nominal: t.nominal, status: t.status, bukti_url: t.bukti_url
      })));
    };
    fetchData();
  }, []);

  const handleUpdateStatus = async (idTransfer: string, statusBaru: StatusTransfer['status']) => {
    setLoadingAction(idTransfer);
    const { error } = await supabase.from('tagihan').update({ status: statusBaru }).eq('id', idTransfer);

    if (!error) {
      setTransfers(prev => prev.map(tf => tf.id === idTransfer ? { ...tf, status: statusBaru } : tf));
    } else {
      alert("Gagal update status: " + error.message);
    }
    setLoadingAction(null);
  };

  const handleUploadBukti = async (e: React.ChangeEvent<HTMLInputElement>, idTransfer: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(idTransfer);
    const fileExt = file.name.split('.').pop();
    const fileName = `tf-${idTransfer}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);

    if (uploadError) {
      alert('Gagal upload struk. Pastikan bucket "receipts" sudah dibuat di Supabase!');
      setIsUploading(null);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);

    await supabase.from('tagihan').update({ status: 'Menunggu Konfirmasi', bukti_url: publicUrl }).eq('id', idTransfer);
    
    setTransfers(prev => prev.map(tf => tf.id === idTransfer ? { ...tf, status: 'Menunggu Konfirmasi', bukti_url: publicUrl } : tf));
    setIsUploading(null);
  };

  // ==========================================
  // REVISI LOGIKA UTAMA: GROUPING DAFTAR ACARA (KIRI)
  // ==========================================
  
  // Group A: Sesi di mana SAYA PUNYA HUTANG yang belum lunas
  const sesiHutang = daftarSesi.filter(sesi => 
    transfers.some(tf => tf.id_sesi === sesi.id && tf.dari_user_id === currentUser?.id && tf.status !== 'Lunas')
  );

  // Group B: Sesi di mana SAYA PUNYA PIUTANG yang belum lunas (dan tidak punya hutang di sana)
  const sesiPiutang = daftarSesi.filter(sesi => 
    !transfers.some(tf => tf.id_sesi === sesi.id && tf.dari_user_id === currentUser?.id && tf.status !== 'Lunas') &&
    transfers.some(tf => tf.id_sesi === sesi.id && tf.ke_user_id === currentUser?.id && tf.status !== 'Lunas')
  );

  // Group C: Sesi yang bersih / Orang Lain / Semua transaksi sudah Lunas
  const sesiLunasDanLainnya = daftarSesi.filter(sesi => 
    !sesiHutang.some(s => s.id === sesi.id) && !sesiPiutang.some(s => s.id === sesi.id)
  );

  // ==========================================
  // PENGELOMPOKAN DATA KANAN (KARTU TAGIHAN)
  // ==========================================
  const tagihanAktif = transfers.filter(tf => tf.id_sesi === sesiTerpilih);
  const hutangSaya = tagihanAktif.filter(tf => tf.dari_user_id === currentUser?.id);
  const piutangSaya = tagihanAktif.filter(tf => tf.ke_user_id === currentUser?.id);
  const tagihanLain = tagihanAktif.filter(tf => tf.dari_user_id !== currentUser?.id && tf.ke_user_id !== currentUser?.id);

  const bagikanKeWA = () => {
    const sesi = daftarSesi.find(s => s.id === sesiTerpilih);
    if (!sesi) return;

    let teks = `📢 *TAGIHAN ACARA: ${sesi.nama}* 📢\n\n`;
    if (piutangSaya.length > 0) {
      teks += `Halo gengs! Mohon kerjasamanya untuk pelunasan acara kemaren ya 🙏\n\n`;
      teks += `*STATUS TAGIHAN KE SAYA:*\n`;
      piutangSaya.forEach(tf => {
        const pengirim = profiles.find(p => p.id === tf.dari_user_id)?.nama;
        const status = tf.status === 'Lunas' ? '✅ LUNAS' : `❌ Rp ${Math.round(tf.nominal).toLocaleString('id-ID')}`;
        teks += `- ${pengirim}: ${status}\n`;
      });
      const myProfile = profiles.find(p => p.id === currentUser?.id);
      teks += `\n💳 *Rekening Saya:* ${myProfile?.nama_bank || 'Belum Diisi'} - ${myProfile?.no_rekening || ''}\n\n`;
    }
    teks += `Cek detail dan upload bukti transfer di aplikasi *KitaKitaSemua*! 🚀`;
    window.open(`https://wa.me/?text=${encodeURIComponent(teks)}`, '_blank');
  };

  const renderKartuTagihan = (tf: StatusTransfer) => {
    const profilPengirim = profiles.find(p => p.id === tf.dari_user_id);
    const profilPenerima = profiles.find(p => p.id === tf.ke_user_id);
    const isSayaYangBerhutang = tf.dari_user_id === currentUser?.id;
    const isSayaYangDitalangi = tf.ke_user_id === currentUser?.id;
    const isLoading = loadingAction === tf.id;
    const isUpload = isUploading === tf.id;
    const bankInfo = profilPenerima?.nama_bank ? `${profilPenerima.nama_bank} - ${profilPenerima.no_rekening}` : 'Belum diisi';

    return (
      <div key={tf.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-all ${tf.status === 'Lunas' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'}`}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              {tf.status === 'Belum Bayar' && <span className="bg-rose-100 text-rose-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">Belum Bayar</span>}
              {tf.status === 'Menunggu Konfirmasi' && <span className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md animate-pulse">Cek Rekening ⏳</span>}
              {tf.status === 'Lunas' && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">Lunas ✓</span>}
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Nominal</div>
              <div className="font-black text-xl text-slate-900">Rp {Math.round(tf.nominal).toLocaleString('id-ID')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100">{profilPengirim?.nama || 'Unknown'}</div>
            <div className="text-slate-300">➔</div>
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100">{profilPenerima?.nama || 'Unknown'}</div>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 text-xs flex justify-between items-center border-b border-slate-100">
          <span className="text-slate-500 font-medium">Bank Tujuan:</span>
          <span className={`font-bold ${profilPenerima?.nama_bank ? 'text-slate-800' : 'text-rose-500 italic'}`}>{bankInfo}</span>
        </div>
        {tf.bukti_url && (
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-blue-50/30">
            <span className="text-xs font-bold text-slate-600">Bukti Transfer:</span>
            <a href={tf.bukti_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 underline hover:text-blue-800">Lihat Struk 📄</a>
          </div>
        )}
        <div className="p-4">
          {isSayaYangBerhutang && tf.status === 'Belum Bayar' && (
            <div>
               <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[tf.id] = el; }} onChange={(e) => handleUploadBukti(e, tf.id)} />
               <button onClick={() => fileInputRefs.current[tf.id]?.click()} disabled={isUpload} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 rounded-xl shadow-sm min-h-[44px] transition-colors">
                  {isUpload ? 'Mengunggah Struk...' : '📸 Upload Bukti TF & Klaim Lunas'}
               </button>
            </div>
          )}
          {isSayaYangDitalangi && tf.status === 'Menunggu Konfirmasi' && (
            <div className="flex gap-2">
              <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} disabled={isLoading} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-3 rounded-xl min-h-[44px] shadow-sm">Validasi Lunas</button>
              <button onClick={() => handleUpdateStatus(tf.id, 'Belum Bayar')} disabled={isLoading} className="border-2 border-rose-200 text-rose-600 text-sm font-bold px-4 rounded-xl hover:bg-rose-50 min-h-[44px]">Tolak</button>
            </div>
          )}
          {isSayaYangDitalangi && tf.status === 'Belum Bayar' && (
            <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} disabled={isLoading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 min-h-[44px]">
              {isLoading ? 'Memproses...' : '⚡ Lunas Instan (Terima Tunai)'}
            </button>
          )}
          {!isSayaYangBerhutang && !isSayaYangDitalangi && tf.status !== 'Lunas' && <div className="text-center text-xs text-slate-400 py-2 font-medium">(Hanya {profilPengirim?.nama} yang bisa klaim)</div>}
          {tf.status === 'Lunas' && <div className="text-center text-xs text-emerald-600 font-bold py-2">🎉 Pembayaran Selesai</div>}
        </div>
      </div>
    );
  };

  // Fungsi pembantu merender item list sebelah kiri
  const renderItemSesiKiri = (sesi: SesiJajan, type: 'hutang' | 'piutang' | 'lunas') => (
    <div 
      key={sesi.id} 
      onClick={() => setSesiTerpilih(sesi.id)} 
      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
        sesiTerpilih === sesi.id 
          ? 'bg-blue-50 border-blue-500 shadow-md' 
          : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="font-bold text-slate-800 text-sm truncate max-w-[160px]">{sesi.nama || 'Sesi Tanpa Nama'}</div>
        {type === 'hutang' && <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded">🔴 HUTANG</span>}
        {type === 'piutang' && <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded">🟢 PIUTANG</span>}
        {type === 'lunas' && <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded">⚪ AMAN</span>}
      </div>
      <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
        <span className="uppercase px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px]">{sesi.warung}</span>
        <span className="font-bold text-slate-700">Rp {sesi.total.toLocaleString('id-ID')}</span>
      </div>
    </div>
  );

  if (!currentUser) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan Pusat Tagihan...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto min-h-screen bg-slate-50">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Pusat Tagihan 💸</h2>
        <p className="text-slate-500 mt-2">Daftar hutang piutang riil dari seluruh lapak dan acara.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* ========================================== */}
        {/* KOLOM KIRI: DAFTAR ACARA YANG SUDAH TERGRUP */}
        {/* ========================================== */}
        <div className="lg:col-span-4 space-y-6 max-h-[80vh] overflow-y-auto pr-2">
          
          {/* GROUP A: PERLU DIBAYAR */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-rose-700 uppercase tracking-wider flex justify-between items-center px-1">
              <span>🚨 Perlu Kamu Bayar</span>
              <span className="bg-rose-100 px-2 py-0.5 rounded-full text-[10px]">{sesiHutang.length}</span>
            </h3>
            {sesiHutang.length === 0 ? (
              <div className="bg-slate-100/50 p-3 rounded-xl border border-dashed text-slate-400 text-xs italic text-center">Bebas hutang, aman! ✨</div>
            ) : (
              sesiHutang.map(sesi => renderItemSesiKiri(sesi, 'hutang'))
            )}
          </div>

          {/* GROUP B: PERLU DITAGIH */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider flex justify-between items-center px-1">
              <span>💰 Perlu Kamu Tagih</span>
              <span className="bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">{sesiPiutang.length}</span>
            </h3>
            {sesiPiutang.length === 0 ? (
              <div className="bg-slate-100/50 p-3 rounded-xl border border-dashed text-slate-400 text-xs italic text-center">Tidak ada tagihan keluar.</div>
            ) : (
              sesiPiutang.map(sesi => renderItemSesiKiri(sesi, 'piutang'))
            )}
          </div>

          {/* GROUP C: SELESAI / ACARA LAIN */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center px-1">
              <span>✅ Selesai / Lainnya</span>
              <span className="bg-slate-200 px-2 py-0.5 rounded-full text-[10px]">{sesiLunasDanLainnya.length}</span>
            </h3>
            {sesiLunasDanLainnya.length === 0 ? (
              <div className="text-slate-300 text-xs text-center py-2">Kosong</div>
            ) : (
              sesiLunasDanLainnya.map(sesi => renderItemSesiKiri(sesi, 'lunas'))
            )}
          </div>

        </div>

        {/* ========================================== */}
        {/* KOLOM KANAN: RINCIAN INVOICE               */}
        {/* ========================================== */}
        <div className="lg:col-span-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-900">Rincian Penagihan</h3>
            {sesiTerpilih && piutangSaya.length > 0 && (
              <button onClick={bagikanKeWA} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 min-h-[36px] transition-colors">
                📲 Tagih via WA
              </button>
            )}
          </div>

          {!sesiTerpilih ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-400 text-sm">Pilih acara di sebelah kiri terlebih dahulu.</div>
          ) : tagihanAktif.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 text-sm italic shadow-sm">
              Tidak ada pergerakan hutang di acara ini. 🎉
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* DETAIL HUTANG SAYA */}
              <div>
                <h4 className="font-bold text-rose-700 mb-4 flex items-center gap-2"><span>💸</span> Hutang Saya Ke Teman</h4>
                {hutangSaya.length === 0 ? (
                  <div className="bg-white p-4 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm italic">Lunas / Tidak ada hutang Anda di sesi ini.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {hutangSaya.map(tf => renderKartuTagihan(tf))}
                  </div>
                )}
              </div>

              {/* DETAIL PIUTANG SAYA */}
              <div>
                <h4 className="font-bold text-emerald-700 mb-4 flex items-center gap-2"><span>🤑</span> Piutang Teman Ke Saya</h4>
                {piutangSaya.length === 0 ? (
                  <div className="bg-white p-4 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm italic">Tidak ada piutang aktif untuk Anda di sesi ini.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {piutangSaya.map(tf => renderKartuTagihan(tf))}
                  </div>
                )}
              </div>

              {/* DETAIL HUTANG ORANG LAIN */}
              {tagihanLain.length > 0 && (
                <div className="opacity-70 pt-4 border-t border-slate-200">
                  <h4 className="font-bold text-slate-500 mb-4 flex items-center gap-2"><span>👥</span> Alur Hutang Anggota Lain</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tagihanLain.map(tf => renderKartuTagihan(tf))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}