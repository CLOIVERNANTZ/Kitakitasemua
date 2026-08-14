'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import CustomModal from '@/components/CustomModal';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [totalHutangBerjalan, setTotalHutangBerjalan] = useState(0);
  const [totalPiutangBerjalan, setTotalPiutangBerjalan] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // ✅ TAMBAHAN STATE UNTUK CEK STATUS ACC
  const [isApproved, setIsApproved] = useState(false); 

  const [modal, setModal] = useState({
    isOpen: false,
    type: 'success' as 'success' | 'error' | 'warning' | 'loading',
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: undefined as (() => void) | undefined
  });

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    
    // ✅ Ambil data nama DAN is_approved
    const { data: profileData } = await supabase.from('profiles').select('nama, is_approved').eq('id', user.id).single();
    
    setCurrentUser({ id: user.id, nama: profileData?.nama || 'User' });
    setIsApproved(profileData?.is_approved || false); // 👈 Terapkan statusnya

    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'Open')
      .order('created_at', { ascending: false });

    if (eventsData) setHistory(eventsData);

    const { data: tagihanData } = await supabase
      .from('tagihan').select('nominal').eq('dari_user_id', user.id).eq('status', 'Belum Bayar');
    if (tagihanData) setTotalHutangBerjalan(tagihanData.reduce((sum, tf) => sum + Number(tf.nominal), 0));

    const { data: piutangData } = await supabase
      .from('tagihan').select('nominal').eq('ke_user_id', user.id).eq('status', 'Belum Bayar');
    if (piutangData) setTotalPiutangBerjalan(piutangData.reduce((sum, tf) => sum + Number(tf.nominal), 0));
    
    setIsLoading(false);
  };

  const tutupSesi = (e: React.MouseEvent, idSesi: string) => {
    e.stopPropagation();
    setModal(prev => ({
      ...prev,
      isOpen: true,
      type: 'warning',
      title: 'Kunci Sesi?',
      message: 'Setelah ditutup, peserta tidak bisa lagi mengedit keranjang. Tagihan akan dikunci.',
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Memproses...', message: 'Menutup sesi dan menyiapkan tagihan...', onCancel: undefined }));
        await supabase.from('events').update({ status: 'Closed' }).eq('id', idSesi);
        setHistory(history.filter(h => h.id !== idSesi));
        setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Berhasil!', message: 'Sesi telah ditutup.', onConfirm: closeModal }));
      }
    }));
  };

  const hapusSesi = (e: React.MouseEvent, idSesi: string) => {
    e.stopPropagation();
    setModal(prev => ({
      ...prev,
      isOpen: true,
      type: 'error',
      title: 'Hapus Permanen?',
      message: 'Seluruh data ekstra dan tagihan yang terhubung dengan proyek ini akan lenyap selamanya.',
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Menghapus...', message: 'Melenyapkan data dari sistem...', onCancel: undefined }));
        await supabase.from('tagihan').delete().eq('event_id', idSesi);
        const { error } = await supabase.from('events').delete().eq('id', idSesi);
        if (!error) {
          setHistory(history.filter(h => h.id !== idSesi));
          setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Terhapus!', message: 'Data telah musnah dari database.', onConfirm: closeModal }));
        } else {
          setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: error.message, onConfirm: closeModal }));
        }
      }
    }));
  };

  const handleKlikSesi = (sesi: any) => {
    if (sesi.tipe_acara === 'JAJAN') router.push(`/jajan/${sesi.id}`); 
    else if (sesi.tipe_acara === 'PROJECT') router.push(`/dashboard/lapak?id=${sesi.id}`);
    else if (sesi.tipe_acara === 'NGINAP') router.push(`/dashboard/nginap?viewId=${sesi.id}`);
    else router.push(`/jajan/${sesi.id}`);
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Memuat data dari KitaKitaSemua...</div>;

  // 🛑 BLOKIR AKSES JIKA BELUM DI-ACC
  if (!isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
        <div className="max-w-md w-full bg-white/90 p-8 rounded-3xl shadow-2xl text-center">
          <span className="text-6xl mb-4 block">👮‍♂️</span>
          <h2 className="text-2xl font-black text-slate-900 mb-2">SABARRRR!!</h2>
          <p className="text-slate-600 font-medium mb-6">
            akun mu udah ke daftar sebenarnya, tapi bang RINGO belum kasih akses. Minta ajaahhh, gk usah manja!.
          </p>
          <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
            <p className="text-sm font-bold text-slate-500 mb-1">Kirim pesan / WA ke:(085162563828)</p>
            <a href="mailto:germansiringo1234@gmail.com" className="text-amber-600 font-black text-lg hover:underline">
              email:germansiringo1234@gmail.com
              CEPATTTTT!!
            </a>
          </div>
          <button 
            onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
            className="mt-6 w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-950 transition"
          >
            Keluar Dulu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-900">
      <CustomModal {...modal} />

      <header className="mb-10 text-center sm:text-left mt-4">
        <h2 className="text-4xl font-black tracking-tight text-slate-800">Halo bosku, <span className="text-amber-500">{currentUser?.nama}</span>! ☕</h2>
        <p className="text-slate-500 mt-2 font-medium">Nih rekap keuangan tongkrongan kita hari ini.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-[2rem] p-8 border-[3px] border-rose-100 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-3xl mb-4 border border-rose-100 rotate-[-5deg]">💸</div>
          <p className="text-sm font-black text-rose-400 uppercase tracking-widest mb-1">Utang Lu (Bayar woi!)</p>
          <h4 className="text-4xl font-black text-slate-800 tracking-tight">Rp {Math.round(totalHutangBerjalan).toLocaleString('id-ID')}</h4>
        </div>
        
        <div className="bg-white rounded-[2rem] p-8 border-[3px] border-emerald-100 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center text-3xl mb-4 border border-emerald-100 rotate-[5deg]">🤑</div>
          <p className="text-sm font-black text-emerald-500 uppercase tracking-widest mb-1">Duit Lu di Orang (Tagihin!)</p>
          <h4 className="text-4xl font-black text-slate-800 tracking-tight">Rp {Math.round(totalPiutangBerjalan).toLocaleString('id-ID')}</h4>
        </div>
      </div>

      {(totalHutangBerjalan > 0 || totalPiutangBerjalan > 0) && (
        <div className="text-center mb-12">
          <button onClick={() => router.push('/dashboard/riwayat')} className="bg-slate-800 text-white hover:bg-black font-bold px-8 py-4 rounded-full shadow-lg shadow-slate-900/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 w-full md:w-auto mx-auto">
            Lihat Rincian Bon ➔
          </button>
        </div>
      )}

      <div>
        <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <span className="text-3xl">⛺</span> Lapak Tongkrongan yang Masih Buka
        </h3>
        
        <div className="flex flex-col gap-4">
          {history.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center flex flex-col items-center">
              <span className="text-5xl mb-4 grayscale opacity-40">📭</span>
              <span className="text-slate-500 font-bold">Sepi euy. Belum ada lapak tongkrongan yang buka hari ini.</span>
            </div>
          ) : (
            history.map(sesi => (
              <div key={sesi.id} onClick={() => handleKlikSesi(sesi)} className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex flex-col sm:flex-row sm:justify-between sm:items-center hover:border-amber-300 hover:shadow-xl hover:shadow-amber-500/5 cursor-pointer transition-all gap-4 group">
                <div className="flex gap-4 items-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl border-4 border-white shadow-sm shrink-0
                    ${sesi.tipe_acara === 'JAJAN' ? 'bg-amber-100' : sesi.tipe_acara === 'PROJECT' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                    {sesi.tipe_acara === 'JAJAN' ? '🍔' : sesi.tipe_acara === 'PROJECT' ? '🛠️' : '🏨'}
                  </div>
                  <div>
                    <div className="font-black text-slate-800 text-xl flex flex-wrap items-center gap-2">
                      {sesi.nama_acara}
                      <span className="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-1 rounded-full animate-pulse uppercase font-black tracking-wider">🟢 ON GOING</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 font-bold tracking-wide">{sesi.tanggal}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 justify-between sm:justify-end ml-16 sm:ml-0 border-t sm:border-t-0 border-slate-100 pt-4 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <div className="font-black text-slate-800 text-xl">Rp {Math.round(Number(sesi.total_biaya || 0)).toLocaleString('id-ID')}</div>
                    <div className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block mt-1">{sesi.partisipan_ids?.length || 0} Anak Nongkrong</div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={(e) => tutupSesi(e, sesi.id)} className="bg-slate-100 text-slate-600 hover:bg-slate-800 hover:text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all border border-slate-200 opacity-100 sm:opacity-0 group-hover:opacity-100 touch-manipulation hover:scale-105 active:scale-95 shadow-sm">
                      Bungkus!
                    </button>
                    <button onClick={(e) => hapusSesi(e, sesi.id)} className="bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all border border-rose-100 opacity-100 sm:opacity-0 group-hover:opacity-100 touch-manipulation hover:scale-105 active:scale-95 shadow-sm" title="Hapus Permanen">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}