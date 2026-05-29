'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [totalHutangBerjalan, setTotalHutangBerjalan] = useState(0);
  const [totalPiutangBerjalan, setTotalPiutangBerjalan] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    
    const { data: profileData } = await supabase.from('profiles').select('nama').eq('id', user.id).single();
    setCurrentUser({ id: user.id, nama: profileData?.nama || 'User' });

    // Tarik list Sesi - FILTER OPEN
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      
      .eq('status', 'Open') 
      .order('created_at', { ascending: false });

    if (eventsData) setHistory(eventsData);

    // Tarik total Hutang
    const { data: tagihanData } = await supabase
      .from('tagihan')
      .select('nominal')
      .eq('dari_user_id', user.id)
      .eq('status', 'Belum Bayar');

    if (tagihanData) {
      const hutangSaya = tagihanData.reduce((sum, tf) => sum + Number(tf.nominal), 0);
      setTotalHutangBerjalan(hutangSaya);
    }

    const { data: piutangData } = await supabase
      .from('tagihan')
      .select('nominal')
      .eq('ke_user_id', user.id)
      .eq('status', 'Belum Bayar');

    if (piutangData) {
      const piutangSaya = piutangData.reduce((sum, tf) => sum + Number(tf.nominal), 0);
      setTotalPiutangBerjalan(piutangSaya);
    }
    
    setIsLoading(false);
  };

  const tutupSesi = async (e: React.MouseEvent, idSesi: string) => {
    e.stopPropagation(); 
    if (!window.confirm('Tutup acara ini? Peserta tidak bisa lagi mengedit.')) return;

    await supabase.from('events').update({ status: 'Closed' }).eq('id', idSesi);
    // Karena beranda HANYA memuat yang Open, saat ditutup, langsung kita keluarkan dari state UI
    setHistory(history.filter(h => h.id !== idSesi)); 
  };

  // MASUKKAN FUNGSI HAPUS DI SINI (Di dalam Komponen)
  const hapusSesi = async (e: React.MouseEvent, idSesi: string) => {
    e.stopPropagation(); // Mencegah kartu tidak sengaja terklik masuk ke dalam detail
    if (!window.confirm('Hapus proyek/sesi ini secara permanen dari database? Seluruh data ekstra di dalamnya akan hilang.')) return;

    // 1. Hapus data tagihan yang terhubung dengan event ini jika ada
    await supabase.from('tagihan').delete().eq('event_id', idSesi);

    // 2. Hapus data utama di tabel events
    const { error } = await supabase.from('events').delete().eq('id', idSesi);

    if (!error) {
      // Hapus dari tampilan layar saat ini
      setHistory(history.filter(h => h.id !== idSesi));
      alert('Sesi berhasil dihapus secara permanen!');
    } else {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  // ==========================================
  // PENGARAH HALAMAN PINTAR (SUDAH DIPERBARUI)
  // ==========================================
  const handleKlikSesi = (sesi: any) => {
    if (sesi.tipe_acara === 'JAJAN') {
      router.push(`/jajan/${sesi.id}`); 
    } else if (sesi.tipe_acara === 'PROJECT') {
      router.push(`/dashboard/lapak?id=${sesi.id}`); // Mengirim ID Project
    } else if (sesi.tipe_acara === 'NGINAP') {
      router.push(`/dashboard/nginap?viewId=${sesi.id}`); // Mengirim ID Nginap
    } else {
      router.push(`/jajan/${sesi.id}`);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Memuat data dari KitaKitaSemua...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-900">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight">Halo, {currentUser?.nama}! 👋</h2>
        <p className="text-slate-500 mt-1">Rekapan Hutang-Piutang KitaKitaSemua.</p>
      </header>

      {/* WIDGET KEUANGAN: HUTANG & PIUTANG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        
        {/* KARTU 1: HUTANG SAYA (MERAH) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-2 bg-rose-500"></div>
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-2xl mb-3 border border-rose-100">💸</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hutang Mu! Bayar... (Kata Mei)</p>
          <h4 className="text-3xl font-black text-slate-900 mt-1">Rp {totalHutangBerjalan.toLocaleString('id-ID')}</h4>
        </div>

        {/* KARTU 2: PIUTANG SAYA (HIJAU) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-2 bg-emerald-500"></div>
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-2xl mb-3 border border-emerald-100">🤑</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Uang yang tertunda (Harus sabar!!!)</p>
          <h4 className="text-3xl font-black text-slate-900 mt-1">Rp {totalPiutangBerjalan.toLocaleString('id-ID')}</h4>
        </div>

      </div>

      {/* TOMBOL LIHAT RINCIAN */}
      {(totalHutangBerjalan > 0 || totalPiutangBerjalan > 0) && (
        <div className="text-center mb-10">
          <button onClick={() => router.push('/dashboard/riwayat')} className="bg-slate-900 text-white hover:bg-slate-800 font-bold px-8 py-3.5 rounded-2xl text-sm shadow-md transition-colors flex items-center justify-center gap-2 w-full md:w-auto mx-auto">
            Lihat HUTANG PIUTANG para (BONGAK) ➔
          </button>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><span>🎯</span> Project & Sesi Saya</h3>
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <span className="text-4xl mb-3 opacity-50">📭</span>
              <span className="text-slate-500 font-medium">Belum ada project yang diikuti.</span>
            </div>
          ) : (
            history.map(sesi => (
              
              /* PERHATIKAN onClick DI BAWAH INI, DIA MEMANGGIL handleKlikSesi */
              <div key={sesi.id} onClick={() => handleKlikSesi(sesi)} className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center hover:bg-slate-50 cursor-pointer transition-colors gap-3 group">
                <div>
                  <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    {sesi.nama_acara}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${sesi.tipe_acara === 'JAJAN' ? 'bg-amber-100 text-amber-700' : sesi.tipe_acara === 'PROJECT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {sesi.tipe_acara}
                    </span>
                    {sesi.status === 'Open' ? (
                      <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-md animate-pulse uppercase font-bold">Berjalan</span>
                    ) : (
                      <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-md uppercase font-bold">Selesai</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">{sesi.tanggal}</div>
                </div>
                
                <div className="flex items-center gap-4 sm:justify-end">
                  <div className="text-right">
                    <div className="font-black text-slate-800 text-lg">Rp {Number(sesi.total_biaya || 0).toLocaleString('id-ID')}</div>
                    <div className="text-[11px] font-semibold text-slate-400">{sesi.partisipan_ids?.length || 0} Partisipan</div>
                  </div>
                  
                  {/* PENEMPATAN TOMBOL HAPUS DAN TUTUP YANG BENAR */}
                  {sesi.status === 'Open' && (
                    <div className="flex gap-2">
                      <button onClick={(e) => tutupSesi(e, sesi.id)} className="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors border border-rose-200 opacity-0 group-hover:opacity-100 sm:flex hidden">
                        Tutup & Tagih
                      </button>
                      
                      {/* 🗑️ TOMBOL HAPUS PERMANEN */}
                      <button onClick={(e) => hapusSesi(e, sesi.id)} className="bg-slate-100 text-slate-500 hover:bg-slate-600 hover:text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors opacity-0 group-hover:opacity-100 sm:flex hidden" title="Hapus Permanen">
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
              /* AKHIR DARI ELEMEN KARTU */

            ))
          )}
        </div>
      </div>
    </div>
  );
}