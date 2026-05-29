'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase'; // ✅ Pakai util Supabase
import CustomModal from '@/components/CustomModal'; // ✅ Import Custom Modal

interface Anggota { id: string; nama: string; }
interface RincianBiaya { id: string; item: string; harga: number; }
type ModeSplit = 'bagi_rata' | 'manual';

// Interface Partisipan agar tidak pakai 'any'
interface PartisipanState {
  id: string;
  nama: string;
  ikut: boolean;
  isGratis: boolean;
  nominalManual: number;
}

function NginapKuyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewId = searchParams?.get('viewId');
  const isViewMode = !!viewId;

  const [currentUser, setCurrentUser] = useState<{ id: string; nama?: string } | null>(null);
  const [anggota, setAnggota] = useState<Anggota[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [namaProyek, setNamaProyek] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [pahlawanId, setPahlawanId] = useState<string>('');
  
  const [rincianBiaya, setRincianBiaya] = useState<RincianBiaya[]>([]);
  const [inputItem, setInputItem] = useState('');
  const [inputHarga, setInputHarga] = useState('');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const totalBiaya = rincianBiaya.reduce((sum, r) => sum + r.harga, 0);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [partisipan, setPartisipan] = useState<PartisipanState[]>([]);
  const [modeSplit, setModeSplit] = useState<ModeSplit>('bagi_rata');

  // ✅ STATE UNTUK CUSTOM MODAL
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
    fetchUsers();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setCurrentUser(user);

    const { data: profiles } = await supabase.from('profiles').select('id, nama');
    if (profiles) {
      setAnggota(profiles);
      setPartisipan(profiles.map(a => ({ id: a.id, nama: a.nama, ikut: true, isGratis: false, nominalManual: 0 })));
      setPahlawanId(user.id);
    }
    
    if (viewId) {
       const { data: eventData } = await supabase.from('events').select('*').eq('id', viewId).single();
       if (eventData) {
           setNamaProyek(eventData.nama_acara);
           setTanggal(eventData.tanggal);
           setPahlawanId(eventData.pahlawan_ids?.[0] || '');
           if (eventData.data_ekstra) {
               setRincianBiaya(eventData.data_ekstra.rincian || []);
           }
           const partisipanDB = eventData.partisipan_ids || [];
           setPartisipan(profiles ? profiles.map(a => ({ 
               id: a.id, nama: a.nama, ikut: partisipanDB.includes(a.id), isGratis: false, nominalManual: 0 
           })) : []);
       }
    }
    setIsLoading(false);
  };

  const handleTambahRincian = (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewMode || !inputItem || !inputHarga) return;
    const hargaNum = Number(inputHarga.replace(/\D/g, ''));
    setRincianBiaya([...rincianBiaya, { id: 'item_' + Date.now(), item: inputItem, harga: hargaNum }]);
    setInputItem(''); setInputHarga('');
  };

  // ✅ LOGIKA SCAN STRUK DAN COMBINE BIAYA
  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Membaca Struk...', message: 'Google AI sedang memindai baris teks bill Anda...', onCancel: undefined }));

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Result = reader.result as string;
        
        // Tembak API Route internal kita
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Result })
        });

        const data = await res.json();

        if (data.items && data.items.length > 0) {
          // 🌟 KUNCI LOGIKA: Gabungkan data lama (manual) dengan data baru hasil OCR Google
          setRincianBiaya(prev => [...prev, ...data.items]);
          
          setModal(prev => ({
            ...prev, isOpen: true, type: 'success', title: 'Scan Berhasil!', 
            message: `Berhasil mendeteksi & menambahkan ${data.items.length} item pengeluaran baru dari struk!`,
            onConfirm: closeModal
          }));
        } else {
          setModal(prev => ({ ...prev, isOpen: true, type: 'warning', title: 'Teks Tidak Jelas', message: 'Google tidak menemukan format nama item & harga yang cocok. Silakan input manual atau coba foto lebih dekat.', onConfirm: closeModal }));
        }
      } catch (err) {
        setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Gagal Scan', message: 'Terjadi kegagalan koneksi sistem OCR.', onConfirm: closeModal }));
      } finally {
        setIsOcrLoading(false);
      }
    };
  };

  const handleUbahPartisipan = (id: string, field: 'ikut' | 'isGratis', value: boolean) => {
    if (isViewMode) return;
    setPartisipan(prev => prev.map(p => {
      if (p.id === id) {
        if (field === 'ikut' && !value) return { ...p, ikut: false, isGratis: false, nominalManual: 0 };
        if (field === 'isGratis' && value) return { ...p, ikut: true, isGratis: true, nominalManual: 0 };
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const hitungSimulasi = () => {
    let hasil: Record<string, number> = {};
    const partisipanIkut = partisipan.filter(p => p.ikut);

    if (modeSplit === 'bagi_rata') {
      const yangBayar = partisipanIkut.filter(p => !p.isGratis);
      const perOrang = yangBayar.length > 0 ? totalBiaya / yangBayar.length : 0;
      partisipanIkut.forEach(p => { hasil[p.id] = p.isGratis ? 0 : perOrang; });
    } else {
      partisipanIkut.forEach(p => { hasil[p.id] = p.nominalManual; });
    }
    return hasil;
  };

  const hasilSimulasi = hitungSimulasi();
  const partisipanIkut = partisipan.filter(p => p.ikut);
  const totalSimulasi = partisipanIkut.reduce((sum, p) => sum + (hasilSimulasi[p.id] || 0), 0);
  const selisihManual = totalBiaya - totalSimulasi;

  // ✅ LOGIKA BUAT TAGIHAN MENGGUNAKAN CUSTOM MODAL (SUDAH AMAN DARI TYPESCRIPT)
  const handleBuatTagihan = () => {
    if (rincianBiaya.length === 0) {
      return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Oops!', message: 'Masukkan minimal 1 rincian biaya pengeluaran!', onConfirm: closeModal, onCancel: undefined }));
    }
    if (modeSplit === 'manual' && selisihManual !== 0) {
      return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Selisih Ditemukan!', message: 'Total pembagian manual tidak sama dengan Total Biaya Proyek!', onConfirm: closeModal, onCancel: undefined }));
    }
    
    setModal(prev => ({
      ...prev,
      isOpen: true,
      type: 'warning',
      title: 'Sebar Tagihan?',
      message: 'Anda yakin ingin menutup proyek ini dan menyebar tagihan ke teman-teman?',
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Memproses...', message: 'Merekam ke database...', onCancel: undefined }));
        
        const idSesi = 'proyek-' + Date.now();
        const { error: eventError } = await supabase.from('events').insert({
          id: idSesi,
          tipe_acara: 'NGINAP',
          nama_acara: namaProyek,
          tanggal: tanggal,
          status: 'Closed',
          total_biaya: totalBiaya,
          pahlawan_ids: [pahlawanId],
          partisipan_ids: partisipanIkut.map(p => p.id),
          data_ekstra: { rincian: rincianBiaya }
        });

        if (eventError) {
          return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: eventError.message, onConfirm: closeModal, onCancel: undefined }));
        }

        const newTransfers: any[] = [];
        partisipanIkut.forEach(p => {
          const hutang = hasilSimulasi[p.id];
          if (hutang > 0 && p.id !== pahlawanId) {
            newTransfers.push({
              id: `tf_${p.id}_to_${pahlawanId}_${idSesi}`,
              event_id: idSesi,
              dari_user_id: p.id,
              ke_user_id: pahlawanId,
              nominal: hutang,
              status: 'Belum Bayar'
            });
          }
        });

        if (newTransfers.length > 0) {
          const { error: tfError } = await supabase.from('tagihan').insert(newTransfers);
          if (tfError) {
            return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: tfError.message, onConfirm: closeModal, onCancel: undefined }));
          }
        }

        setModal(p => ({ 
          ...p, isOpen: true, type: 'success', title: 'Berhasil!', message: 'Tagihan resmi disebar ke teman-teman.', 
          onCancel: undefined,
          onConfirm: () => {
            closeModal();
            router.push('/dashboard/riwayat');
          } 
        }));
      }
    }));
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan data teman...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto min-h-screen text-slate-900 pb-20">
      <CustomModal {...modal} /> {/* ✅ RENDER MODAL DI SINI */}

      <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            🏨 Nginap Kuy 
            {isViewMode && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-md uppercase tracking-widest mt-1">Read-Only</span>}
          </h2>
          <p className="text-slate-500 mt-1">Buat tagihan kilat dengan rincian biaya transparan.</p>
        </div>
      </header>

      <div className="space-y-6">
        
        {/* INFO PROYEK */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><span>📝</span> Informasi Acara</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-sm font-semibold text-slate-600 block mb-1.5">Nama Proyek / Tempat</label>
              <input disabled={isViewMode} type="text" placeholder="Contoh: Villa Puncak Bogor" value={namaProyek} onChange={(e)=>setNamaProyek(e.target.value)} className="w-full px-4 py-3 border border-slate-200 disabled:bg-slate-50 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"/>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600 block mb-1.5">Tanggal Invoice</label>
              <input disabled={isViewMode} type="date" value={tanggal} onChange={(e)=>setTanggal(e.target.value)} className="w-full px-4 py-3 border border-slate-200 disabled:bg-slate-50 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"/>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1.5">Siapa Yang Nalangin? (Pahlawan)</label>
            <select disabled={isViewMode} value={pahlawanId} onChange={(e)=>setPahlawanId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold bg-slate-50 disabled:opacity-70 focus:ring-2 focus:ring-amber-500 focus:outline-none">
              {anggota.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
            </select>
          </div>
        </div>

        {/* TABEL RINCIAN BIAYA */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><span>📋</span> Rincian Pengeluaran</h3>
          
          {!isViewMode && (
            /* ✅ BUNGKUS DENGAN DIV INI AGAR REACT TIDAK ERROR */
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-4 space-y-4">
              
              {/* INPUT BIASA (MANUAL) */}
              <form onSubmit={handleTambahRincian} className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="Nama Item Manual (Cth: Sewa Villa)" required value={inputItem} onChange={(e)=>setInputItem(e.target.value)} className="flex-1 px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white" />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-sm text-slate-400 font-bold">Rp</span>
                  <input type="text" placeholder="0" required value={inputHarga === '' ? '' : Number(inputHarga).toLocaleString('id-ID')} onChange={(e) => setInputHarga(e.target.value.replace(/\D/g, ''))} className="w-full pl-9 pr-3 py-2 text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white" />
                </div>
                <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2 rounded-lg text-sm transition-colors shadow-sm">+ Tambah Manual</button>
              </form>

              {/* ✅ TOMBOL COMBINE UPLOAD STRUK OCR (OCR.SPACE) */}
              <div className="pt-3 border-t border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase">Punya Nota/Bill Panjang? Scan di sini otomatis ➔</span>
                <label className={`w-full sm:w-auto bg-blue-100 text-blue-700 hover:bg-blue-200 px-5 py-2.5 rounded-xl font-bold text-sm border border-blue-200 shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${isOcrLoading ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}>
                  <input type="file" accept="image/*" disabled={isOcrLoading} onChange={handleOcrUpload} className="hidden" />
                  📸 {isOcrLoading ? 'Sedang Membaca...' : 'Scan Foto Struk Bill'}
                </label>
              </div>

            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl mt-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">No</th>
                  <th className="px-4 py-3">Nama Item</th>
                  <th className="px-4 py-3 text-right">Harga (Rp)</th>
                  {!isViewMode && <th className="px-4 py-3 w-16 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rincianBiaya.length === 0 ? (
                  <tr><td colSpan={isViewMode ? 3 : 4} className="text-center py-8 text-slate-400 italic">Belum ada rincian biaya.</td></tr>
                ) : (
                  rincianBiaya.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-center text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.item}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700">{r.harga.toLocaleString('id-ID')}</td>
                      {!isViewMode && (
                          <td className="px-4 py-3 text-center"><button onClick={() => setRincianBiaya(rincianBiaya.filter(item => item.id !== r.id))} className="text-rose-500 font-bold touch-manipulation">✕</button></td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-800 text-white font-bold">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right uppercase tracking-wider text-xs">Total Pengeluaran</td>
                  <td className="px-4 py-3 text-right text-lg text-amber-400">Rp {totalBiaya.toLocaleString('id-ID')}</td>
                  {!isViewMode && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* DISTRIBUSI TAGIHAN */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2"><span>🔪</span> Skema Split Bill</h3>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button type="button" disabled={isViewMode} onClick={() => setModeSplit('bagi_rata')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${modeSplit === 'bagi_rata' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'} ${isViewMode && 'opacity-70 cursor-not-allowed'} touch-manipulation`}>Bagi Rata</button>
              <button type="button" disabled={isViewMode} onClick={() => setModeSplit('manual')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${modeSplit === 'manual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'} ${isViewMode && 'opacity-70 cursor-not-allowed'} touch-manipulation`}>Input Manual</button>
            </div>
          </div>

          <div className="mb-6 relative" ref={dropdownRef}>
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Pilih PIC (Siapa Saja Yang Ikut)</label>
            <button type="button" disabled={isViewMode} onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex justify-between items-center px-4 py-3 bg-white disabled:bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-amber-500 touch-manipulation">
              <span>👤 {partisipanIkut.length} Partisipan Terpilih</span>
              <span className="text-[10px]">▼</span>
            </button>
            {isDropdownOpen && !isViewMode && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto p-2">
                {partisipan.map(p => (
                  <label key={p.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={p.ikut} onChange={(e) => handleUbahPartisipan(p.id, 'ikut', e.target.checked)} className="w-5 h-5 text-amber-500 rounded"/>
                    <span className={`text-sm ${p.ikut ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{p.nama}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {partisipanIkut.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm italic bg-slate-50 rounded-xl border border-dashed">Silakan pilih partisipan.</div>
            ) : (
              partisipanIkut.map(p => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                    <span className="font-bold text-slate-800 w-24 truncate">{p.nama}</span>
                    {modeSplit === 'bagi_rata' && (
                      <label className={`flex items-center gap-1.5 ${isViewMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg`}>
                        <input disabled={isViewMode} type="checkbox" checked={p.isGratis} onChange={(e) => handleUbahPartisipan(p.id, 'isGratis', e.target.checked)} className="w-4 h-4 text-emerald-500 rounded"/>
                        <span className="text-xs font-bold text-slate-600">Gratis</span>
                      </label>
                    )}
                  </div>
                  <div className="text-right">
                    {modeSplit === 'bagi_rata' ? (
                      <div className="flex flex-col items-end">
                        <span className={`font-black text-lg ${p.isGratis ? 'text-emerald-500 line-through decoration-2 opacity-50' : 'text-slate-900'}`}>Rp {Math.round(hasilSimulasi[p.id]).toLocaleString('id-ID')}</span>
                      </div>
                    ) : (
                      <div className="relative w-full sm:w-48">
                        <span className="absolute left-3 top-2 text-sm text-slate-400 font-bold">Rp</span>
                        <input disabled={isViewMode} type="text" value={p.nominalManual === 0 ? '' : p.nominalManual.toLocaleString('id-ID')} onChange={(e) => setPartisipan(prev => prev.map(item => item.id === p.id ? { ...item, nominalManual: Number(e.target.value.replace(/\D/g, '')) } : item))} placeholder="0" className="w-full pl-9 pr-3 py-2 border disabled:bg-slate-50 rounded-xl font-bold text-slate-900 text-right"/>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {!isViewMode && (
            <button onClick={handleBuatTagihan} disabled={!namaProyek || totalBiaya === 0 || partisipanIkut.length === 0} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg shadow-lg disabled:opacity-50 transition-colors touch-manipulation">
               🚀 Buat & Sebar Tagihan Sekarang
            </button>
        )}
      </div>
    </div>
  );
}

export default function NginapKuyPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan halaman...</div>}>
      <NginapKuyContent />
    </Suspense>
  );
}