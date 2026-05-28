'use client';
import { useRouter } from 'next/navigation';

export default function JajanKuyEntryPage() {
  const router = useRouter();

  const buatSesiBaru = () => {
    // Generate ID unik dan lempar ke halaman kalkulator jajan
    const idBaru = 'sesi-' + Date.now();
    router.push(`/dashboard/jajan/${idBaru}`);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto text-slate-900 h-full flex flex-col justify-center items-center pb-32">
      
      <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-sm border border-amber-200">
        🍔
      </div>
      
      <h2 className="text-3xl font-extrabold tracking-tight text-center mb-2">Mulai Jajan Bareng</h2>
      <p className="text-slate-500 text-center mb-10 max-w-md leading-relaxed">
        Buka sesi pesanan baru, ajak teman-teman memasukkan menu yang mereka mau, dan biarkan sistem yang menghitung patungannya!
      </p>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm w-full text-center space-y-6">
        <div className="space-y-4 text-sm text-slate-600 text-left bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><span>💡</span> Cara Kerja Sesi Jajan:</h4>
          <p>1. <b>Buka Sesi:</b> Anda membuat ruang virtual dan menentukan nama warung/resto.</p>
          <p>2. <b>Input Pesanan:</b> Teman-teman akan memilih menu masing-masing dan skema bayarnya (Sendiri / Dibagi Rata / Ditraktir).</p>
          <p>3. <b>Otomatis Hitung:</b> Sistem akan membagikan nominal tagihan (termasuk PPN) kepada siapa saja yang berhutang ke Pahlawan/Kasir.</p>
        </div>

        <button 
          onClick={buatSesiBaru} 
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-lg px-6 py-4 rounded-2xl shadow-lg shadow-amber-500/20 transition-all transform active:scale-95 flex justify-center items-center gap-2"
        >
          🚀 Buka Sesi Jajan Sekarang
        </button>
      </div>
      
    </div>
  );
}