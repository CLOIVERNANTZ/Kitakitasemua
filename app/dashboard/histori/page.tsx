'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function HistoriAcaraPage() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistoriData();
  }, []);

  const fetchHistoriData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    
    // Tarik SEMUA sesi/acara tanpa mempedulikan status Open atau Closed
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .contains('partisipan_ids', [user.id])
      .order('created_at', { ascending: false });

    if (eventsData) setHistory(eventsData);
    setIsLoading(false);
  };

  const handleKlikSesi = (sesi: any) => {
    if (sesi.tipe_acara === 'JAJAN') {
      router.push(`/jajan/${sesi.id}`); 
    } else if (sesi.tipe_acara === 'PROJECT') {
      router.push(`/dashboard/lapak?id=${sesi.id}`); 
    } else if (sesi.tipe_acara === 'NGINAP') {
      router.push(`/dashboard/nginap?viewId=${sesi.id}`); 
    } else {
      router.push(`/jajan/${sesi.id}`);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Membuka lemari arsip acara...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-900">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight">📂 Histori Seluruh Acara</h2>
        <p className="text-slate-500 mt-1">Daftar rekam jejak seluruh proyek kelompok yang pernah Anda ikuti.</p>
      </header>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        {history.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <span className="text-4xl mb-3 opacity-50">📭</span>
            <span className="text-slate-500 font-medium">Belum ada histori data proyek.</span>
          </div>
        ) : (
          history.map(sesi => (
            <div 
              key={sesi.id} 
              onClick={() => handleKlikSesi(sesi)} 
              className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center hover:bg-slate-50 cursor-pointer transition-colors gap-3 group"
            >
              <div>
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  {sesi.nama_acara}
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${sesi.tipe_acara === 'JAJAN' ? 'bg-amber-100 text-amber-700' : sesi.tipe_acara === 'PROJECT' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {sesi.tipe_acara}
                  </span>
                  
                  {/* Label Status Dinamis */}
                  {sesi.status === 'Open' ? (
                    <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-md animate-pulse uppercase font-bold">Berjalan</span>
                  ) : (
                    <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded-md uppercase font-bold">🔒 Ditutup</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium">{sesi.tanggal}</div>
              </div>
              
              <div className="flex items-center gap-4 sm:justify-end">
                <div className="text-right">
                  <div className="font-black text-slate-800 text-lg">Rp {Number(sesi.total_biaya || 0).toLocaleString('id-ID')}</div>
                  <div className="text-[11px] font-semibold text-slate-400">{sesi.partisipan_ids?.length || 0} Partisipan</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}