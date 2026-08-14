'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import CustomModal from '@/components/CustomModal';

interface Anggota { id: string; nama: string; }
interface RincianBiaya { id: string; item: string; harga: number; }
type ModeSplit = 'bagi_rata' | 'manual';

interface PartisipanState {
  id: string;
  nama: string;
  ikut: boolean;
  isGratis: boolean;
  nominalManual: number;
  isTamu?: boolean;
  rincianBiaya: RincianBiaya[];
  isExpanded?: boolean;
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
  
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  
  const [partisipan, setPartisipan] = useState<PartisipanState[]>([]);
  const [modeSplit, setModeSplit] = useState<ModeSplit>('bagi_rata');

  const [modal, setModal] = useState({
    isOpen: false,
    type: 'success' as 'success' | 'error' | 'warning' | 'loading',
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: undefined as (() => void) | undefined
  });
  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

  // Helper Total Biaya
  const partisipanIkut = partisipan.filter(p => p.ikut);
  const totalBiaya = partisipanIkut.reduce((sum, p) => sum + p.rincianBiaya.reduce((s, r) => s + r.harga, 0), 0);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setCurrentUser(user);

    const { data: profiles } = await supabase.from('profiles').select('id, nama');
    const { data: historiTamu } = await supabase.from('tagihan_tamu').select('nama_tamu');
    const tamuUnik = historiTamu ? Array.from(new Set(historiTamu.map(t => t.nama_tamu))) : [];

    if (profiles) {
      setAnggota(profiles);
      
      const listMember: PartisipanState[] = profiles.map(a => ({ id: a.id, nama: a.nama, ikut: false, isGratis: false, nominalManual: 0, rincianBiaya: [], isTamu: false }));
      const listTamu: PartisipanState[] = tamuUnik.map(nama => ({ id: nama, nama: `👤 ${nama} (Tamu)`, ikut: false, isGratis: false, nominalManual: 0, rincianBiaya: [], isTamu: true }));
      
      let finalPartisipan = [...listMember, ...listTamu];

      if (viewId) {
         const { data: eventData } = await supabase.from('events').select('*').eq('id', viewId).single();
         if (eventData) {
             setNamaProyek(eventData.nama_acara);
             setTanggal(eventData.tanggal);
             setPahlawanId(eventData.pahlawan_ids?.[0] || '');
             
             const partisipanDB = eventData.partisipan_ids || [];
             const { data: tagihanTamuEvent } = await supabase.from('tagihan_tamu').select('nama_tamu').eq('event_id', viewId);
             const tamuSesiIni = tagihanTamuEvent ? tagihanTamuEvent.map(t => t.nama_tamu) : [];

             tamuSesiIni.forEach(nama => {
               if (!finalPartisipan.some(p => p.id === nama)) {
                 finalPartisipan.push({ id: nama, nama: `👤 ${nama} (Tamu)`, ikut: true, isGratis: false, nominalManual: 0, rincianBiaya: [], isTamu: true });
               }
             });

             finalPartisipan = finalPartisipan.map(p => {
               const isIkut = p.isTamu ? tamuSesiIni.includes(p.id) : partisipanDB.includes(p.id);
               return { ...p, ikut: isIkut };
             });

             // Migrasi data lama jika ada rincian global
             if (eventData.data_ekstra?.rincian && eventData.data_ekstra.rincian.length > 0) {
               const pahlawan = finalPartisipan.find(p => p.id === (eventData.pahlawan_ids?.[0] || user.id));
               if (pahlawan) {
                 pahlawan.rincianBiaya = eventData.data_ekstra.rincian;
               }
             }

             // Migrasi data baru (per orang)
             if (eventData.data_ekstra?.rincianPerOrang) {
                Object.keys(eventData.data_ekstra.rincianPerOrang).forEach(pid => {
                  const p = finalPartisipan.find(x => x.id === pid);
                  if (p) p.rincianBiaya = eventData.data_ekstra.rincianPerOrang[pid];
                });
             }
         }
      } else {
         // Default if creating new: Include Creator
         finalPartisipan = finalPartisipan.map(p => p.id === user.id ? { ...p, ikut: true } : p);
         setPahlawanId(user.id);
      }

      setPartisipan(finalPartisipan);
    }
    setIsLoading(false);
  };

  const handleAddPartisipan = () => {
    if (!selectedToAdd) return;
    setPartisipan(prev => {
      const existing = prev.find(p => p.id === selectedToAdd);
      if (existing) {
        return prev.map(p => p.id === selectedToAdd ? { ...p, ikut: true } : p);
      } else {
        // Tamu baru
        return [...prev, { id: selectedToAdd, nama: `👤 ${selectedToAdd} (Tamu)`, ikut: true, isGratis: false, nominalManual: 0, rincianBiaya: [], isTamu: true }];
      }
    });
    setSelectedToAdd('');
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 1200;
          if (width > height) {
            if (width > MAX_DIM) { height = Math.round((height *= MAX_DIM / width)); width = MAX_DIM; }
          } else {
            if (height > MAX_DIM) { width = Math.round((width *= MAX_DIM / height)); height = MAX_DIM; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>, participantId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Menyiapkan Gambar...', message: 'Mengompres foto agar lolos batas OCR...', onCancel: undefined }));

    try {
      const base64Result = await compressImage(file);
      setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Membaca Struk...', message: 'Google AI sedang memindai baris teks bill Anda...', onCancel: undefined }));
        
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Result })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.items && data.items.length > 0) {
        setPartisipan(prev => prev.map(p => p.id === participantId ? { ...p, rincianBiaya: [...p.rincianBiaya, ...data.items] } : p));
        setModal(prev => ({
          ...prev, isOpen: true, type: 'success', title: 'Scan Berhasil!', 
          message: `Berhasil mendeteksi & menambahkan ${data.items.length} item pengeluaran ke ${partisipan.find(x => x.id === participantId)?.nama}!`,
          onConfirm: closeModal
        }));
      } else {
        setModal(prev => ({ ...prev, isOpen: true, type: 'warning', title: 'Teks Tidak Jelas', message: 'Tidak menemukan format nama item & harga yang cocok.', onConfirm: closeModal }));
      }
    } catch (err: any) {
      setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Gagal Scan', message: err.message || 'Terjadi kegagalan koneksi sistem OCR.', onConfirm: closeModal }));
    } finally {
      setIsOcrLoading(false);
      e.target.value = ''; // reset file input
    }
  };

  const handleUbahPartisipan = (id: string, field: 'ikut' | 'isGratis' | 'isExpanded' | 'nominalManual', value: any) => {
    if (isViewMode && field !== 'isExpanded') return;
    setPartisipan(prev => prev.map(p => {
      if (p.id === id) {
        if (field === 'ikut' && !value) return { ...p, ikut: false, isGratis: false, nominalManual: 0, rincianBiaya: [] };
        if (field === 'isGratis' && value) return { ...p, ikut: true, isGratis: true, nominalManual: 0 };
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const hitungSimulasi = () => {
    let hasil: Record<string, number> = {};
    if (modeSplit === 'bagi_rata') {
      const yangBayar = partisipanIkut.filter(p => !p.isGratis);
      const perOrang = yangBayar.length > 0 ? totalBiaya / yangBayar.length : 0;
      partisipanIkut.forEach(p => { 
        const beban = p.isGratis ? 0 : perOrang;
        const sudahKeluar = p.rincianBiaya.reduce((s, r) => s + r.harga, 0);
        hasil[p.id] = beban - sudahKeluar; 
      });
    } else {
      partisipanIkut.forEach(p => { 
        const sudahKeluar = p.rincianBiaya.reduce((s, r) => s + r.harga, 0);
        hasil[p.id] = p.nominalManual - sudahKeluar; 
      });
    }
    return hasil;
  };

  const hasilSimulasi = hitungSimulasi();
  const totalSimulasi = partisipanIkut.reduce((sum, p) => sum + (p.isGratis ? 0 : (modeSplit === 'bagi_rata' ? (partisipanIkut.filter(x=>!x.isGratis).length > 0 ? totalBiaya / partisipanIkut.filter(x=>!x.isGratis).length : 0) : p.nominalManual)), 0);
  const selisihManual = totalBiaya - totalSimulasi;

  const handleBuatTagihan = () => {
    if (totalBiaya === 0) {
      return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Oops!', message: 'Masukkan minimal 1 rincian biaya pengeluaran di salah satu partisipan!', onConfirm: closeModal, onCancel: undefined }));
    }
    if (modeSplit === 'manual' && Math.round(selisihManual) !== 0) {
      return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Selisih Ditemukan!', message: 'Total pembagian manual tidak sama dengan Total Biaya Proyek!', onConfirm: closeModal, onCancel: undefined }));
    }
    
    setModal(prev => ({
      ...prev, isOpen: true, type: 'warning', title: 'Sebar Tagihan?',
      message: 'Anda yakin ingin menutup proyek ini dan menyebar tagihan ke teman-teman?',
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Memproses...', message: 'Merekam ke database...', onCancel: undefined }));
        
        const rincianPerOrang: Record<string, RincianBiaya[]> = {};
        partisipanIkut.forEach(p => { if (p.rincianBiaya.length > 0) rincianPerOrang[p.id] = p.rincianBiaya; });

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
          data_ekstra: { rincianPerOrang }
        });

        if (eventError) {
          return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: eventError.message, onConfirm: closeModal, onCancel: undefined }));
        }

        const newTransfers: any[] = [];
        const newTamuTransfers: any[] = [];
        
        partisipanIkut.forEach(p => {
          const hutang = Math.round(hasilSimulasi[p.id]);
          if (p.id !== pahlawanId && hutang !== 0) {
            const payload = {
              event_id: idSesi,
              nominal: Math.abs(hutang),
              status: 'Belum Bayar'
            };
            if (hutang > 0) {
              // p owes pahlawan
              if (p.isTamu) newTamuTransfers.push({ ...payload, nama_tamu: p.id, ke_user_id: pahlawanId });
              else newTransfers.push({ ...payload, dari_user_id: p.id, ke_user_id: pahlawanId });
            } else {
              // pahlawan owes p
              if (p.isTamu) newTamuTransfers.push({ ...payload, dari_user_id: pahlawanId, nama_tamu: p.id });
              else newTransfers.push({ ...payload, dari_user_id: pahlawanId, ke_user_id: p.id });
            }
          }
        });

        if (newTransfers.length > 0) {
          const { error: tfError } = await supabase.from('tagihan').insert(newTransfers.map(t => ({...t, id: `tf_${Date.now()}_${Math.random()}` })));
          if (tfError) return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: tfError.message, onConfirm: closeModal, onCancel: undefined }));
        }
        if (newTamuTransfers.length > 0) {
          const { error: tamuError } = await supabase.from('tagihan_tamu').insert(newTamuTransfers);
          if (tamuError) return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: tamuError.message, onConfirm: closeModal, onCancel: undefined }));
        }

        setModal(p => ({ 
          ...p, isOpen: true, type: 'success', title: 'Berhasil!', message: 'Tagihan resmi disebar ke teman-teman.', 
          onCancel: undefined, onConfirm: () => { closeModal(); router.push('/dashboard/riwayat'); } 
        }));
      }
    }));
  };

  if (isLoading) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan data teman...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto min-h-screen text-slate-900 pb-20">
      <CustomModal {...modal} />

      <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            🏨 Nginap Kuy 
            {isViewMode && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-md uppercase tracking-widest mt-1">Read-Only</span>}
          </h2>
          <p className="text-slate-500 mt-1">Buat tagihan adil dengan fitur potong pengeluaran pribadi.</p>
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
            <label className="text-sm font-semibold text-slate-600 block mb-1.5">Bendahara Utama (Pahlawan)</label>
            <select disabled={isViewMode} value={pahlawanId} onChange={(e)=>setPahlawanId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl font-bold bg-slate-50 disabled:opacity-70 focus:ring-2 focus:ring-amber-500 focus:outline-none">
              {anggota.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-2">Semua tagihan akan diarahkan ke bendahara. Jika ada yang pengeluarannya lebih besar dari tagihannya, bendahara akan berhutang kepadanya.</p>
          </div>
        </div>

        {/* PARTISIPAN & PENGELUARAN PRIBADI */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2"><span>👥</span> Partisipan & Pengeluaran</h3>
              <p className="text-xs text-slate-500 mt-1">Total Biaya Keseluruhan: <strong className="text-amber-500">Rp {totalBiaya.toLocaleString('id-ID')}</strong></p>
            </div>
            {!isViewMode && (
              <div className="flex items-center gap-2">
                <select value={selectedToAdd} onChange={(e) => setSelectedToAdd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">-- Tambah Orang --</option>
                  {anggota.filter(a => !partisipanIkut.find(p => p.id === a.id)).map(a => (
                    <option key={a.id} value={a.id}>{a.nama}</option>
                  ))}
                  <option disabled>──────</option>
                  <option value="Tamu_Baru">+ Tulis Nama Tamu Baru...</option>
                </select>
                {selectedToAdd === 'Tamu_Baru' ? (
                  <button onClick={() => { const nama = prompt('Masukkan nama tamu:'); if(nama) { setSelectedToAdd(nama); setTimeout(()=>handleAddPartisipan(), 100); } else setSelectedToAdd(''); }} className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-sm transition-colors">+</button>
                ) : (
                  <button onClick={handleAddPartisipan} className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-sm transition-colors">Add</button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {partisipanIkut.map((p) => {
              const totalPribadi = p.rincianBiaya.reduce((s, r) => s + r.harga, 0);
              return (
                <div key={p.id} className="border border-slate-200 rounded-2xl overflow-hidden transition-all bg-white shadow-sm">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer gap-4" onClick={() => handleUbahPartisipan(p.id, 'isExpanded', !p.isExpanded)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 font-bold rounded-full flex items-center justify-center border border-indigo-200 text-sm">
                        {p.nama.charAt(p.nama.startsWith('👤') ? 3 : 0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{p.nama}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Sudah Keluar: <span className="font-bold text-amber-600">Rp {totalPribadi.toLocaleString('id-ID')}</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
                      <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" disabled={isViewMode} checked={p.isGratis} onChange={(e) => handleUbahPartisipan(p.id, 'isGratis', e.target.checked)} className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500 bg-white" />
                        <span className={`text-xs font-bold ${p.isGratis ? 'text-emerald-500' : 'text-slate-400'}`}>Gratis</span>
                      </label>
                      {!isViewMode && (
                        <button onClick={(e) => { e.stopPropagation(); handleUbahPartisipan(p.id, 'ikut', false); }} className="text-slate-400 hover:bg-rose-100 hover:text-rose-600 rounded-full w-8 h-8 flex items-center justify-center transition-colors">
                          ✕
                        </button>
                      )}
                      <svg className={`w-5 h-5 text-slate-400 transform transition-transform ${p.isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>

                  {/* Card Body (Rincian Biaya) */}
                  {p.isExpanded && (
                    <div className="p-4 border-t border-slate-100 bg-white">
                      {!isViewMode && (
                        <div className="flex flex-col sm:flex-row gap-2 mb-4">
                          <form className="flex flex-1 gap-2" onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const item = (form.elements.namedItem('item') as HTMLInputElement).value;
                            const hrg = Number((form.elements.namedItem('harga') as HTMLInputElement).value.replace(/\D/g, ''));
                            if (!item || !hrg) return;
                            setPartisipan(prev => prev.map(x => x.id === p.id ? { ...x, rincianBiaya: [...x.rincianBiaya, { id: 'r_'+Date.now(), item, harga: hrg }] } : x));
                            form.reset();
                          }}>
                            <input name="item" type="text" placeholder="Nama pengeluaran (Cth: Bensin)" required className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                            <input name="harga" type="number" placeholder="Harga" required className="w-28 sm:w-32 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                            <button type="submit" className="bg-amber-100 text-amber-700 font-bold px-3 py-2 rounded-lg text-xs hover:bg-amber-200 transition-colors">Tambah</button>
                          </form>
                          <label className={`bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-lg font-bold text-xs border border-blue-100 flex items-center justify-center cursor-pointer transition-colors ${isOcrLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input type="file" accept="image/*" disabled={isOcrLoading} onChange={(e) => handleOcrUpload(e, p.id)} className="hidden" />
                            📸 Scan Struk
                          </label>
                        </div>
                      )}

                      {p.rincianBiaya.length === 0 ? (
                        <div className="text-center py-4 text-xs text-slate-400 italic">Belum ada pengeluaran yang dicatat.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left mb-2">
                            <tbody>
                              {p.rincianBiaya.map(r => (
                                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                  <td className="py-2.5 px-2 text-slate-700">{r.item}</td>
                                  <td className="py-2.5 px-2 text-right font-bold text-slate-700">Rp {r.harga.toLocaleString('id-ID')}</td>
                                  {!isViewMode && (
                                    <td className="w-8 text-right px-1">
                                      <button onClick={() => setPartisipan(prev => prev.map(x => x.id === p.id ? { ...x, rincianBiaya: x.rincianBiaya.filter(y => y.id !== r.id) } : x))} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 w-6 h-6 rounded-full font-bold flex items-center justify-center touch-manipulation">✕</button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {partisipanIkut.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm font-medium">
                Belum ada orang yang dipilih. Silakan pilih dari dropdown di atas.
              </div>
            )}
          </div>
        </div>

        {/* DISTRIBUSI TAGIHAN */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2"><span>🔪</span> Skema Split Bill Akhir</h3>
              <p className="text-xs text-slate-500 mt-1">Pembagian Beban - Total Sudah Keluar = Hutang Akhir</p>
            </div>
            
            <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <button disabled={isViewMode} onClick={()=>setModeSplit('bagi_rata')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${modeSplit === 'bagi_rata' ? 'bg-white text-amber-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>Bagi Rata</button>
              <button disabled={isViewMode} onClick={()=>setModeSplit('manual')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${modeSplit === 'manual' ? 'bg-white text-amber-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>Manual</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-slate-400 uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3 rounded-tl-xl border-b border-slate-100">Partisipan</th>
                  {modeSplit === 'manual' && <th className="px-4 py-3 text-right border-b border-slate-100">Beban Manual</th>}
                  <th className="px-4 py-3 text-right rounded-tr-xl border-b border-slate-100">Hutang / (Piutang)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {partisipanIkut.map((p) => {
                  const tagihanSisa = hasilSimulasi[p.id] || 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-800">{p.nama}</div>
                        <div className="text-[10px] text-slate-400">{p.isGratis ? 'Bebas Biaya' : 'Ikut Patungan'}</div>
                      </td>
                      {modeSplit === 'manual' && (
                        <td className="px-4 py-3.5 text-right">
                           <input disabled={isViewMode || p.isGratis} type="number" value={p.nominalManual || ''} onChange={(e) => handleUbahPartisipan(p.id, 'nominalManual', Number(e.target.value) as any)} className="w-24 text-right px-2 py-1 text-sm border rounded-md" />
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-right">
                        {p.isGratis ? (
                          <span className="text-emerald-500 font-bold text-xs uppercase bg-emerald-50 px-2 py-1 rounded">Gratis</span>
                        ) : tagihanSisa > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-black text-lg text-rose-500">Rp {Math.round(tagihanSisa).toLocaleString('id-ID')}</span>
                            <span className="text-[9px] text-rose-400 font-bold">Bayar ke Bendahara</span>
                          </div>
                        ) : tagihanSisa < 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-black text-lg text-emerald-500">Rp {Math.abs(Math.round(tagihanSisa)).toLocaleString('id-ID')}</span>
                            <span className="text-[9px] text-emerald-600 font-bold">Diterima dari Bendahara</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold">Lunas (Impas)</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {modeSplit === 'manual' && Math.round(selisihManual) !== 0 && (
            <div className={`mt-6 p-4 rounded-xl border ${selisihManual > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'} flex justify-between items-center text-sm font-medium animate-pulse`}>
              <span>{selisihManual > 0 ? '⚠️ Uang Kurang:' : '⚠️ Uang Berlebih (Kelebihan Target):'}</span>
              <span className="font-bold text-lg">Rp {Math.abs(Math.round(selisihManual)).toLocaleString('id-ID')}</span>
            </div>
          )}
        </div>

        {/* TOMBOL AKSI */}
        {!isViewMode && (
          <div className="flex justify-end pt-4">
             <button onClick={handleBuatTagihan} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-4 rounded-2xl shadow-lg shadow-emerald-500/30 transition-transform transform hover:-translate-y-1 active:translate-y-0 text-lg flex items-center justify-center gap-2">
               <span>🚀</span> Simpan & Sebar Tagihan
             </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NginapKuy() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 font-bold animate-pulse">Memuat Aplikasi...</div>}>
      <NginapKuyContent />
    </Suspense>
  );
}