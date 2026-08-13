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

      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight">Halo, {currentUser?.nama}! 👋</h2>
        <p className="text-slate-500 mt-1">Dashboard real-time dari database KitaKitaSemua.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-2 bg-rose-500"></div>
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-2xl mb-3 border border-rose-100">💸</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hutang Berjalan Anda</p>
          <h4 className="text-3xl font-black text-slate-900 mt-1">Rp {Math.round(totalHutangBerjalan).toLocaleString('id-ID')}</h4>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-2 bg-emerald-500"></div>
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-2xl mb-3 border border-emerald-100">🤑</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Piutang (Uang Anda)</p>
          <h4 className="text-3xl font-black text-slate-900 mt-1">Rp {Math.round(totalPiutangBerjalan).toLocaleString('id-ID')}</h4>
        </div>
      </div>

      {(totalHutangBerjalan > 0 || totalPiutangBerjalan > 0) && (
        <div className="text-center mb-10">
          <button onClick={() => router.push('/dashboard/riwayat')} className="bg-slate-900 text-white hover:bg-slate-800 font-bold px-8 py-3.5 rounded-2xl text-sm shadow-md transition-colors flex items-center justify-center gap-2 w-full md:w-auto mx-auto">
            Lihat Rincian Penagihan ➔
          </button>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><span>🎯</span> Project & Sesi Saya</h3>
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <span className="text-4xl mb-3 opacity-50">📭</span>
              <span className="text-slate-500 font-medium">Belum ada project yang terbuka.</span>
            </div>
          ) : (
            history.map(sesi => (
              <div key={sesi.id} onClick={() => handleKlikSesi(sesi)} className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center hover:bg-slate-50 cursor-pointer transition-colors gap-3 group">
                <div>
                  <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    {sesi.nama_acara}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${sesi.tipe_acara === 'JAJAN' ? 'bg-amber-100 text-amber-700' : sesi.tipe_acara === 'PROJECT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {sesi.tipe_acara}
                    </span>
                    <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-md animate-pulse uppercase font-bold">Berjalan</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">{sesi.tanggal}</div>
                </div>
                
                <div className="flex items-center gap-4 sm:justify-end">
                  <div className="text-right">
                    <div className="font-black text-slate-800 text-lg">Rp {Math.round(Number(sesi.total_biaya || 0)).toLocaleString('id-ID')}</div>
                    <div className="text-[11px] font-semibold text-slate-400">{sesi.partisipan_ids?.length || 0} Partisipan</div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={(e) => tutupSesi(e, sesi.id)} className="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors border border-rose-200 opacity-0 group-hover:opacity-100 sm:flex hidden touch-manipulation">
                      Tutup
                    </button>
                    <button onClick={(e) => hapusSesi(e, sesi.id)} className="bg-slate-100 text-slate-500 hover:bg-slate-600 hover:text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors opacity-0 group-hover:opacity-100 sm:flex hidden touch-manipulation" title="Hapus Permanen">
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