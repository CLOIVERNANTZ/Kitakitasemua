'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [totalHutangBerjalan, setTotalHutangBerjalan] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

 const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    
    const { data: profileData } = await supabase.from('profiles').select('nama').eq('id', user.id).single();
    setCurrentUser({ id: user.id, nama: profileData?.nama || 'User' });

    // REVISI UTAMA: Tambahkan .eq('status', 'Open') agar beranda bersih
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .contains('partisipan_ids', [user.id])
      .eq('status', 'Open') // 🌟 Kunci penyelamatnya di sini!
      .order('created_at', { ascending: false });

    if (eventsData) setHistory(eventsData);

    const { data: tagihanData } = await supabase
      .from('tagihan')
      .select('nominal')
      .eq('dari_user_id', user.id)
      .eq('status', 'Belum Bayar');

    if (tagihanData) {
      const hutangSaya = tagihanData.reduce((sum, tf) => sum + Number(tf.nominal), 0);
      setTotalHutangBerjalan(hutangSaya);
    }
    
    setIsLoading(false);
  };

  const tutupSesi = async (e: React.MouseEvent, idSesi: string) => {
    e.stopPropagation(); 
    if (!window.confirm('Tutup acara ini? Peserta tidak bisa lagi mengedit.')) return;

    await supabase.from('events').update({ status: 'Closed' }).eq('id', idSesi);
    setHistory(history.map(h => h.id === idSesi ? { ...h, status: 'Closed' } : h));
  };

  // ==========================================
  // FUNGSI BARU: PENGARAH HALAMAN PINTAR
  // ==========================================
  const handleKlikSesi = (sesi: any) => {
    if (sesi.tipe_acara === 'JAJAN') {
      router.push(`/jajan/${sesi.id}`); // Masuk ke 3 Tab Navigasi Jajan
    } else if (sesi.tipe_acara === 'PROJECT') {
      router.push(`/dashboard/lapak`); // Masuk ke Grid Excel
    } else if (sesi.tipe_acara === 'NGINAP') {
      router.push(`/dashboard/nginap`); // Masuk ke Form Nginap
    } else {
      router.push(`/jajan/${sesi.id}`); // Fallback darurat
    }
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Memuat data dari KitaKitaSemua...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-900">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight">Halo, {currentUser?.nama}! 👋</h2>
        <p className="text-slate-500 mt-1">Dashboard real-time dari database KitaKitaSemua.</p>
      </header>

      {/* WIDGET TOTAL HUTANG */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center mb-10 relative overflow-hidden">
        <div className="absolute top-0 w-full h-2 bg-rose-500"></div>
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-3xl mb-4 border border-rose-100">💸</div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Hutang Berjalan Anda</p>
        <h4 className="text-4xl font-black text-slate-900 mt-2">Rp {totalHutangBerjalan.toLocaleString('id-ID')}</h4>
        {totalHutangBerjalan > 0 && (
          <button onClick={() => router.push('/dashboard/riwayat')} className="mt-6 bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold px-6 py-2.5 rounded-full text-sm border border-rose-200 transition-colors">
            Lihat Rincian & Bayar
          </button>
        )}
      </div>

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
              <div key={sesi.id} onClick={() => handleKlikSesi(sesi)} className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center hover:bg-slate-50 cursor-pointer transition-colors gap-3 group">
                {/* TOMBOL ONCLICK DI SINI SUDAH DIGANTI */}
                <div>
                  <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    {sesi.nama_acara}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${sesi.tipe_acara === 'JAJAN' ? 'bg-amber-100 text-amber-700' : sesi.tipe_acara === 'PROJECT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {sesi.tipe_acara}
                    </span>
                    {sesi.status === 'Open' ? (
                      <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-md animate-pulse uppercase">Berjalan</span>
                    ) : (
                      <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-md uppercase font-semibold">Selesai</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">{sesi.tanggal}</div>
                </div>
                
                <div className="flex items-center gap-4 sm:justify-end">
                  <div className="text-right">
                    <div className="font-black text-slate-800 text-lg">Rp {Number(sesi.total_biaya || 0).toLocaleString('id-ID')}</div>
                    <div className="text-[11px] font-semibold text-slate-400">{sesi.partisipan_ids?.length || 0} Partisipan</div>
                  </div>
                  
                  {sesi.status === 'Open' && (
                    <button onClick={(e) => tutupSesi(e, sesi.id)} className="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors border border-rose-200 opacity-0 group-hover:opacity-100 sm:flex hidden">
                      Tutup
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}