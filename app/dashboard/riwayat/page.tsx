'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase'; // ✅ Pakai util Supabase
import CustomModal from '@/components/CustomModal'; // ✅ Import Custom Modal

// --- INTERFACE DATA ---
interface SesiJajan { id: string; nama: string; tanggal: string; warung: string; total: number; }
interface UserProfile { id: string; nama: string; nama_bank?: string; no_rekening?: string; }
interface StatusTransfer { id: string; id_sesi: string; dari_user_id: string; ke_user_id: string; nominal: number; status: 'Belum Bayar' | 'Menunggu Konfirmasi' | 'Lunas'; bukti_url?: string; isTamu?: boolean;}

export default function RiwayatJajanPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [daftarSesi, setDaftarSesi] = useState<SesiJajan[]>([]);
  const [sesiTerpilih, setSesiTerpilih] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'event' | 'person'>('event'); // 👈 Mode tampilan baru
  const [orangTerpilih, setOrangTerpilih] = useState<string | null>(null);
  
  const [transfers, setTransfers] = useState<StatusTransfer[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUser(user);

    const { data: profilesData } = await supabase.from('profiles').select('*');
    if (profilesData) setProfiles(profilesData as UserProfile[]);

    const { data: events } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (events) setDaftarSesi(events.map(e => ({ 
      id: e.id, nama: e.nama_acara, tanggal: e.tanggal, 
      warung: e.tipe_acara || 'Acara', total: e.total_biaya 
    })));

    // 1. Tarik data tagihan Anggota Resmi
    const { data: tagihan } = await supabase.from('tagihan').select('*');
    const memberTransfers = tagihan ? tagihan.map(t => ({
      id: t.id, id_sesi: t.event_id, dari_user_id: t.dari_user_id,
      ke_user_id: t.ke_user_id, nominal: t.nominal, status: t.status, bukti_url: t.bukti_url,
      isTamu: false // 👈 Penanda bukan tamu
    })) : [];

    // 2. Tarik data tagihan khusus TAMU
    const { data: tagihanTamu } = await supabase.from('tagihan_tamu').select('*');
    const tamuTransfers = tagihanTamu ? tagihanTamu.map(t => ({
      id: t.id, id_sesi: t.event_id, dari_user_id: t.nama_tamu, // 👈 Simpan nama langsung di kolom ini
      ke_user_id: t.ke_user_id, nominal: t.nominal, status: t.status, bukti_url: null,
      isTamu: true // 👈 Penanda bahwa ini data tamu
    })) : [];

    // 3. Gabungkan seluruh data ke dalam state utama
    setTransfers([...memberTransfers, ...tamuTransfers]);
    console.log("Data Event:", events);
    console.log("Tagihan Member:", tagihan);
    console.log("Tagihan Tamu:", tagihanTamu);
  };

  const handleUpdateStatus = (idTransfer: string, statusBaru: StatusTransfer['status']) => {
    // Cari tahu apakah item target merupakan tagihan tamu atau bukan
    const targetTf = transfers.find(tf => tf.id === idTransfer);
    const tabelTarget = targetTf?.isTamu ? 'tagihan_tamu' : 'tagihan';
    
    // Deteksi jika yang ditolak adalah transaksi Netting Batch
    const isTolakBatch = statusBaru === 'Belum Bayar' && targetTf?.bukti_url?.includes('tf-batch-');

    setModal(prev => ({
      ...prev,
      isOpen: true,
      type: statusBaru === 'Lunas' ? 'success' : 'warning',
      title: statusBaru === 'Lunas' ? 'Validasi Lunas?' : (isTolakBatch ? 'Tolak Netting?' : 'Batalkan?'),
      message: statusBaru === 'Lunas' 
        ? 'Cek lagi weh, siapa tau dia boong!!.' 
        : (isTolakBatch ? 'Ini adalah transfer Netting Jalan Tol. Menolak ini akan mengembalikan semua Hutang & Piutang di dalamnya kembali ke awal (Belum Bayar).' : 'ih gk benar, buat dia Belum Bayar.'),
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Savaarrrrr bwang...', message: 'udah beresss...', onCancel: undefined }));
        
        if (isTolakBatch && targetTf?.bukti_url) {
           // REVERT BATCH NETTING
           const { error } = await supabase.from(tabelTarget)
               .update({ status: 'Belum Bayar', bukti_url: null })
               .eq('bukti_url', targetTf.bukti_url);
           
           if (!error) {
              setTransfers(prevTf => prevTf.map(tf => tf.bukti_url === targetTf.bukti_url ? { ...tf, status: 'Belum Bayar', bukti_url: undefined } : tf));
              setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Netting Dibatalkan', message: 'Semua tagihan dalam netting ini berhasil dikembalikan ke awal.', onConfirm: closeModal }));
           } else {
              setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: error.message, onConfirm: closeModal }));
           }
        } else {
           // NORMAL UPDATE
           const { error } = await supabase.from(tabelTarget)
               .update({ status: statusBaru, bukti_url: statusBaru === 'Belum Bayar' ? null : targetTf?.bukti_url })
               .eq('id', idTransfer);

           if (!error) {
             setTransfers(prevTf => prevTf.map(tf => tf.id === idTransfer ? { ...tf, status: statusBaru, bukti_url: statusBaru === 'Belum Bayar' ? undefined : tf.bukti_url } : tf));
             setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Berhasil!', message: 'Status pembayaran diperbarui.', onConfirm: closeModal }));
           } else {
             setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: error.message, onConfirm: closeModal }));
           }
        }
      }
    }));
  };

  // ✅ LOGIKA NETTING (PLUS-MINUS) PER ORANG
  const netMap = transfers.filter(tf => tf.status === 'Belum Bayar').reduce((acc, tf) => {
    if (tf.ke_user_id === currentUser?.id) {
      acc[tf.dari_user_id] = (acc[tf.dari_user_id] || 0) + tf.nominal;
    } else if (tf.dari_user_id === currentUser?.id) {
      acc[tf.ke_user_id] = (acc[tf.ke_user_id] || 0) - tf.nominal;
    }
    return acc;
  }, {} as Record<string, number>);

  // ✅ MENGAMBIL SEMUA ORANG DARI NETMAP (ANGGOTA + TAMU)
  const listOrangTerkait = Object.keys(netMap)
    .filter(idOrName => idOrName !== currentUser?.id && Math.abs(netMap[idOrName]) > 1)
    .map(idOrName => {
      const profilAsli = profiles.find(p => p.id === idOrName);
      if (profilAsli) return profilAsli;
      
      // Jika tidak ada di profiles, berarti dia Tamu
      return { id: idOrName, nama: `👤 ${idOrName} (Tamu)` }; 
    });

  const handleUploadBukti = async (e: React.ChangeEvent<HTMLInputElement>, idTransfer: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Mengunggah...', message: 'Sedang mengirim bukti transfer ke sistem...', onCancel: undefined }));
    
    const fileExt = file.name.split('.').pop();
    const fileName = `tf-${idTransfer}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);

    if (uploadError) {
      setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Gagal Upload', message: 'Pastikan bucket "receipts" sudah dibuat di Supabase!', onConfirm: closeModal }));
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
    await supabase.from('tagihan').update({ status: 'Menunggu Konfirmasi', bukti_url: publicUrl }).eq('id', idTransfer);
    
    setTransfers(prev => prev.map(tf => tf.id === idTransfer ? { ...tf, status: 'Menunggu Konfirmasi', bukti_url: publicUrl } : tf));
    setModal(prev => ({ ...prev, isOpen: true, type: 'success', title: 'Berhasil Terkirim!', message: 'Bukti transfer sudah diunggah. Tunggu temanmu memvalidasi ya!', onConfirm: closeModal }));
  };

  // ✅ FUNGSI BATCH UPDATE (BAYAR SEMUA / APPROVE SEMUA)
  // ✅ FUNGSI BATCH UPDATE (BAYAR SEMUA / APPROVE SEMUA)
  const handleBatchUpdate = (action: 'settle' | 'approve') => {
    if (!orangTerpilih) return;
    
    // Deteksi apakah yang diklik ini Anggota Resmi atau Tamu
    const targetUser = profiles.find(p => p.id === orangTerpilih);
    const namaTarget = targetUser?.nama || orangTerpilih; 
    const isTamu = !targetUser; 

    setModal(prev => ({
      ...prev,
      isOpen: true,
      type: action === 'approve' ? 'success' : 'warning',
      title: action === 'approve' ? 'Approve Semua?' : 'Bayar Semua?',
      message: action === 'approve' 
        ? `Tandai LUNAS semua tagihan dari ${namaTarget} lintas acara?`
        : `Tandai semua hutangmu ke ${namaTarget} sebagai 'Menunggu Konfirmasi'?`,
      onCancel: closeModal,
      onConfirm: async () => {
        setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Memproses...', message: 'Memperbarui database...', onCancel: undefined }));
        
        // 1. Tentukan tabel target
        const tabelTarget = isTamu ? 'tagihan_tamu' : 'tagihan';
        let query = supabase.from(tabelTarget).update(
          action === 'approve' ? { status: 'Lunas' } : { status: 'Menunggu Konfirmasi' }
        );

        // 2. Tembak query dengan kolom yang tepat
        if (action === 'approve') {
          if (isTamu) {
             query = query.eq('ke_user_id', currentUser?.id).eq('nama_tamu', orangTerpilih).neq('status', 'Lunas');
          } else {
             query = query.eq('ke_user_id', currentUser?.id).eq('dari_user_id', orangTerpilih).neq('status', 'Lunas');
          }
        } else {
          if (isTamu) {
             query = query.eq('nama_tamu', currentUser?.id).eq('ke_user_id', orangTerpilih).eq('status', 'Belum Bayar');
          } else {
             query = query.eq('dari_user_id', currentUser?.id).eq('ke_user_id', orangTerpilih).eq('status', 'Belum Bayar');
          }
        }

        const { error } = await query;

        // 3. Update UI jika berhasil
        if (!error) {
          setTransfers(prevTf => prevTf.map(tf => {
            if (action === 'approve' && tf.ke_user_id === currentUser?.id && tf.dari_user_id === orangTerpilih) {
              return { ...tf, status: 'Lunas' };
            }
            if (action === 'settle' && tf.dari_user_id === currentUser?.id && tf.ke_user_id === orangTerpilih && tf.status === 'Belum Bayar') {
              return { ...tf, status: 'Menunggu Konfirmasi' };
            }
            return tf;
          }));
          setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Berhasil!', message: 'Status diperbarui secara massal.', onConfirm: closeModal }));
        } else {
          setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: error.message, onConfirm: closeModal }));
        }
      }
    }));
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!orangTerpilih) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Mengunggah...', message: 'Memproses Netting (Jalan Tol)...', onCancel: undefined }));
    
    const fileExt = file.name.split('.').pop();
    const fileName = `tf-batch-${orangTerpilih}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);

    if (uploadError) {
      setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Gagal Upload', message: 'Pastikan bucket "receipts" sudah dibuat di Supabase!', onConfirm: closeModal }));
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);

    const targetUser = profiles.find(p => p.id === orangTerpilih);
    const isTamu = !targetUser;
    const tabelTarget = isTamu ? 'tagihan_tamu' : 'tagihan';

    // 1. HUTANG SAYA -> Menunggu Konfirmasi & Set Bukti TF
    let query1 = supabase.from(tabelTarget).update({ status: 'Menunggu Konfirmasi', bukti_url: publicUrl });
    if (isTamu) {
      query1 = query1.eq('nama_tamu', currentUser?.id).eq('ke_user_id', orangTerpilih).eq('status', 'Belum Bayar');
    } else {
      query1 = query1.eq('dari_user_id', currentUser?.id).eq('ke_user_id', orangTerpilih).eq('status', 'Belum Bayar');
    }

    // 2. PIUTANG SAYA -> Lunas Instan (Netting Jalan Tol)
    let query2 = supabase.from(tabelTarget).update({ status: 'Lunas', bukti_url: publicUrl });
    if (isTamu) {
      query2 = query2.eq('nama_tamu', orangTerpilih).eq('ke_user_id', currentUser?.id).eq('status', 'Belum Bayar');
    } else {
      query2 = query2.eq('dari_user_id', orangTerpilih).eq('ke_user_id', currentUser?.id).eq('status', 'Belum Bayar');
    }

    const [res1, res2] = await Promise.all([query1, query2]);

    if (!res1.error && !res2.error) {
      setTransfers(prevTf => prevTf.map(tf => {
        // Update state Hutang Saya
        if (tf.dari_user_id === currentUser?.id && tf.ke_user_id === orangTerpilih && tf.status === 'Belum Bayar') {
          return { ...tf, status: 'Menunggu Konfirmasi', bukti_url: publicUrl };
        }
        // Update state Piutang Saya
        if (tf.ke_user_id === currentUser?.id && tf.dari_user_id === orangTerpilih && tf.status === 'Belum Bayar') {
          return { ...tf, status: 'Lunas', bukti_url: publicUrl };
        }
        return tf;
      }));
      setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Netting Sukses! 🚀', message: 'Hutangmu menunggu konfirmasi, dan Piutangmu telah dilunaskan otomatis.', onConfirm: closeModal }));
    } else {
      setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: res1.error?.message || res2.error?.message || 'Unknown Error', onConfirm: closeModal }));
    }
  };

  // --- LOGIKA GROUPING ---
  const sesiHutang = daftarSesi.filter(sesi => 
    transfers.some(tf => tf.id_sesi === sesi.id && tf.dari_user_id === currentUser?.id && tf.status !== 'Lunas')
  );
  const sesiPiutang = daftarSesi.filter(sesi => 
    !transfers.some(tf => tf.id_sesi === sesi.id && tf.dari_user_id === currentUser?.id && tf.status !== 'Lunas') &&
    transfers.some(tf => tf.id_sesi === sesi.id && tf.ke_user_id === currentUser?.id && tf.status !== 'Lunas')
  );
  const sesiLunasDanLainnya = daftarSesi.filter(sesi => 
    !sesiHutang.some(s => s.id === sesi.id) && !sesiPiutang.some(s => s.id === sesi.id)
  );

  const tagihanAktif = transfers.filter(tf => tf.id_sesi === sesiTerpilih);
  const hutangSaya = tagihanAktif.filter(tf => tf.dari_user_id === currentUser?.id);
  const piutangSaya = tagihanAktif.filter(tf => tf.ke_user_id === currentUser?.id);
  const tagihanLain = tagihanAktif.filter(tf => tf.dari_user_id !== currentUser?.id && tf.ke_user_id !== currentUser?.id);

  const hutangKeOrangTerpilih = transfers.filter(tf => tf.status !== 'Lunas' && tf.dari_user_id === currentUser?.id && tf.ke_user_id === orangTerpilih);
  const piutangKeOrangTerpilih = transfers.filter(tf => tf.status !== 'Lunas' && tf.ke_user_id === currentUser?.id && tf.dari_user_id === orangTerpilih);
  const totalHutangKeOrangTerpilih = hutangKeOrangTerpilih.reduce((acc, tf) => acc + tf.nominal, 0);
  const totalPiutangKeOrangTerpilih = piutangKeOrangTerpilih.reduce((acc, tf) => acc + tf.nominal, 0);

  // ✅ WA MESSAGE UNTUK NETTING
  const bagikanKeWA = (isNetting = false) => {
    let teks = "";
    if (isNetting && orangTerpilih) {
      const target = profiles.find(p => p.id === orangTerpilih);
      const namaTarget = target?.nama || orangTerpilih;
      const saldo = netMap[orangTerpilih] || 0;
      const absSaldo = Math.abs(Math.round(saldo));
      
      teks = `📢 *REKAP SETTLEMENT: ${target?.nama}* 📢\n\n`;
      teks += `Halo ${target?.nama}, ini rekap saldo plus-minus kita dari semua acara ya:\n\n`;
      
      if (saldo > 0) {
        teks += `*Status:* Kamu ada kurang ke aku sebesar:\n💰 *Rp ${absSaldo.toLocaleString('id-ID')}*\n\n`;
        const my = profiles.find(p => p.id === currentUser?.id);
        teks += `💳 *Transfer ke:* ${my?.nama_bank || 'TBD'} - ${my?.no_rekening || ''}\n`;
      } else {
        teks += `*Status:* Aku ada kurang ke kamu sebesar:\n💰 *Rp ${absSaldo.toLocaleString('id-ID')}*\n\nMinta rekeningnya dong! 🙏`;
      }
      
      teks += `\n\n_Generated by JajanBareng App_`;
    } else {
      const sesi = daftarSesi.find(s => s.id === sesiTerpilih);
      if (!sesi) return;
      teks = `📢 *TAGIHAN ACARA: ${sesi.nama}* 📢\n\n`;
      if (piutangSaya.length > 0) {
        teks += `Halo gengs! Mohon kerjasamanya untuk pelunasan ya 🙏\n\n*STATUS:* \n`;
        piutangSaya.forEach(tf => {
          const pengirim = profiles.find(p => p.id === tf.dari_user_id)?.nama;
          teks += `- ${pengirim}: ${tf.status === 'Lunas' ? '✅ LUNAS' : `❌ Rp ${Math.round(tf.nominal).toLocaleString('id-ID')}`}\n`;
        });
        const my = profiles.find(p => p.id === currentUser?.id);
        teks += `\n💳 *Bank:* ${my?.nama_bank || 'TBD'} - ${my?.no_rekening || ''}\n`;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(teks)}`, '_blank');
  };

  const renderKartuTagihan = (tf: StatusTransfer) => {
    const pPengirim = profiles.find(p => p.id === tf.dari_user_id);
    const namaPengirim = tf.isTamu ? tf.dari_user_id : (pPengirim?.nama || 'Unknown');
    const pPenerima = profiles.find(p => p.id === tf.ke_user_id);
    const isSayaHutang = tf.dari_user_id === currentUser?.id;
    const isSayaPiutang = tf.ke_user_id === currentUser?.id;
    const bankInfo = pPenerima?.nama_bank ? `${pPenerima.nama_bank} - ${pPenerima.no_rekening}` : 'Belum diisi';

    // 🌟 AMBIL INFO DETAIL ACARA / EVENT
    const infoAcara = daftarSesi.find(s => s.id === tf.id_sesi);

    return (
      <div key={tf.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-all ${tf.status === 'Lunas' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'}`}>
        
        {/* 📌 HEADER KARTU: MENUNJUKKAN NAMA EVENT & TIPE ACARA */}
        <div className="bg-slate-100 px-5 py-2.5 border-b border-slate-200 flex justify-between items-center gap-2">
          <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wider truncate" title={infoAcara?.nama}>
            📌 {infoAcara?.nama || 'Acara/Project'}
          </span>
          <span className="text-[9px] bg-slate-200 text-slate-600 font-black px-2 py-0.5 rounded uppercase flex-shrink-0">
            {infoAcara?.warung || 'PROJECT'}
          </span>
        </div>

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
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100 truncate">{namaPengirim}</div>
            <div className="text-slate-300">➔</div>
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100 truncate">{pPenerima?.nama || 'Unknown'}</div>
          </div>
        </div>
        {viewMode !== 'person' && (
          <div className="px-5 py-3 bg-slate-50 text-xs flex justify-between items-center border-b border-slate-100">
            <span className="text-slate-500 font-medium">Bank Tujuan:</span>
            <span className={`font-bold ${pPenerima?.nama_bank ? 'text-slate-800' : 'text-rose-500 italic'}`}>{bankInfo}</span>
          </div>
        )}
        {tf.bukti_url && (
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-blue-50/30">
            <span className="text-xs font-bold text-slate-600">Bukti Transfer:</span>
            <a href={tf.bukti_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 underline">Lihat Struk 📄</a>
          </div>
        )}
        <div className="p-4">
          {isSayaHutang && tf.status === 'Belum Bayar' && (
            <div className="flex justify-end">
               <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[tf.id] = el; }} onChange={(e) => handleUploadBukti(e, tf.id)} />
               <button onClick={() => fileInputRefs.current[tf.id]?.click()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm transition-colors touch-manipulation">📸 Upload Bukti TF</button>
            </div>
          )}
          {isSayaPiutang && tf.status === 'Menunggu Konfirmasi' && (
            <div className="flex gap-2">
              <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-3 rounded-xl shadow-sm touch-manipulation">Validasi Lunas</button>
              <button onClick={() => handleUpdateStatus(tf.id, 'Belum Bayar')} className="border-2 border-rose-200 text-rose-600 text-sm font-bold px-4 rounded-xl hover:bg-rose-50 touch-manipulation">Tolak</button>
            </div>
          )}
          {isSayaPiutang && tf.status === 'Belum Bayar' && (
            <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 touch-manipulation">⚡ Lunas Instan</button>
          )}
          {tf.status === 'Lunas' && <div className="text-center text-xs text-emerald-600 font-bold py-2">🎉 Pembayaran Selesai</div>}
        </div>
      </div>
    );
  };

  const renderItemOrangKiri = (p: UserProfile, net: number) => (
    <div key={p.id} onClick={() => setOrangTerpilih(p.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${orangTerpilih === p.id ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
      <div className="flex justify-between items-center mb-1">
        <div className="font-bold text-slate-800 text-sm truncate">{p.nama}</div>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${net > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{net > 0 ? 'PIUTANG' : 'HUTANG'}</span>
      </div>
      <div className="text-xs font-black text-slate-900">Rp {Math.abs(Math.round(net)).toLocaleString('id-ID')}</div>
    </div>
  );

  const renderItemSesiKiri = (sesi: SesiJajan, type: 'hutang' | 'piutang' | 'lunas') => (
    <div key={sesi.id} onClick={() => setSesiTerpilih(sesi.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${sesiTerpilih === sesi.id ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="font-bold text-slate-800 text-sm truncate">{sesi.nama || 'Sesi TBD'}</div>
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${type === 'hutang' ? 'bg-rose-100 text-rose-700' : type === 'piutang' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{type.toUpperCase()}</span>
      </div>
      <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
        <span className="uppercase px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] truncate max-w-[100px]">{sesi.warung}</span>
        <span className="font-bold text-slate-700 whitespace-nowrap">Rp {sesi.total.toLocaleString('id-ID')}</span>
      </div>
    </div>
  );

  const renderCompactRow = (tf: StatusTransfer, isSayaHutang: boolean) => {
    const infoAcara = daftarSesi.find(s => s.id === tf.id_sesi);
    return (
      <div key={tf.id} className={`flex flex-col gap-2 p-3 rounded-xl border ${tf.status === 'Lunas' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex justify-between items-start">
           <div>
             <div className="font-bold text-xs text-slate-800">{infoAcara?.nama || 'Acara'}</div>
             <div className="text-[10px] text-slate-500">{infoAcara?.warung}</div>
           </div>
           <div className="text-right">
             <div className="font-black text-sm text-slate-900">Rp {Math.round(tf.nominal).toLocaleString('id-ID')}</div>
             <div className="text-[9px] font-bold mt-1">
               {tf.status === 'Belum Bayar' && <span className="text-rose-600">BELUM BAYAR</span>}
               {tf.status === 'Menunggu Konfirmasi' && <span className="text-amber-600 animate-pulse">MENUNGGU KONFIRMASI ⏳</span>}
               {tf.status === 'Lunas' && <span className="text-emerald-600">LUNAS ✓</span>}
             </div>
           </div>
        </div>
        
        {/* Actions & Bukti URL */}
        {(tf.bukti_url || (isSayaHutang && tf.status === 'Belum Bayar') || (!isSayaHutang && tf.status !== 'Lunas')) && (
          <div className="mt-1 pt-2 border-t border-slate-200/60 flex justify-between items-center gap-2">
            <div>
              {tf.bukti_url && (
                <a href={tf.bukti_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-blue-600 underline">Lihat Bukti 📄</a>
              )}
            </div>
            <div className="flex gap-1.5">
              {isSayaHutang && tf.status === 'Belum Bayar' && (
                <>
                  <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[tf.id] = el; }} onChange={(e) => handleUploadBukti(e, tf.id)} />
                  <button onClick={() => fileInputRefs.current[tf.id]?.click()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-md shadow-sm transition-colors touch-manipulation">Upload TF</button>
                </>
              )}
              {!isSayaHutang && tf.status === 'Menunggu Konfirmasi' && (
                <>
                  <button onClick={() => handleUpdateStatus(tf.id, 'Belum Bayar')} className="bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold text-[9px] px-2.5 py-1.5 rounded-md transition-colors touch-manipulation">Tolak</button>
                  <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-md shadow-sm transition-colors touch-manipulation">Validasi Lunas</button>
                </>
              )}
              {!isSayaHutang && tf.status === 'Belum Bayar' && (
                <button onClick={() => handleUpdateStatus(tf.id, 'Lunas')} className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-md shadow-sm transition-colors touch-manipulation">Lunas Instan</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!currentUser) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan Pusat Tagihan...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto min-h-screen bg-slate-50 pb-20">
      <CustomModal {...modal} />

      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Pusat Tagihan 💸</h2>
        <p className="text-slate-500 mt-2">Daftar hutang piutang para BONGAKss</p>
        <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit mt-4">
           <button onClick={() => setViewMode('event')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'event' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Berdasarkan Acara</button>
           <button onClick={() => setViewMode('person')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'person' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Berdasarkan Teman (Netting)</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6 max-h-[70vh] lg:max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
          {viewMode === 'event' ? (
            <>
          <div className="space-y-2">
            <h3 className="text-xs font-black text-rose-700 uppercase tracking-wider px-1">🚨 Perlu Kamu Bayar ({sesiHutang.length})</h3>
            {sesiHutang.length === 0 ? <div className="bg-slate-100/50 p-3 rounded-xl border border-dashed text-slate-400 text-xs text-center italic">Bebas hutang! ✨</div> : sesiHutang.map(s => renderItemSesiKiri(s, 'hutang'))}
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider px-1">💰 Perlu Kamu Tagih ({sesiPiutang.length})</h3>
            {sesiPiutang.length === 0 ? <div className="bg-slate-100/50 p-3 rounded-xl border border-dashed text-slate-400 text-xs text-center italic">Tidak ada tagihan keluar.</div> : sesiPiutang.map(s => renderItemSesiKiri(s, 'piutang'))}
          </div>
            </>
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-black text-blue-700 uppercase tracking-wider px-1">👥 Daftar Teman ({listOrangTerkait.length})</h3>
              {listOrangTerkait.length === 0 ? <div className="bg-slate-100/50 p-3 rounded-xl border border-dashed text-slate-400 text-xs text-center italic">Tidak ada saldo gantung.</div> : listOrangTerkait.map(p => renderItemOrangKiri(p, netMap[p.id]))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {viewMode === 'person' && orangTerpilih ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-6 flex justify-between items-center">
                <div>
                   <h3 className="font-bold text-slate-500 text-xs uppercase mb-1">Total Net Saldo dengan {profiles.find(p=>p.id===orangTerpilih)?.nama || orangTerpilih}</h3>
                   <div className={`text-2xl font-black ${netMap[orangTerpilih] > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {netMap[orangTerpilih] > 0 ? 'Dapat Uang' : 'Bayar Uang'} Rp {Math.abs(Math.round(netMap[orangTerpilih] || 0)).toLocaleString('id-ID')}
                   </div>
                   <p className="text-[10px] text-slate-400 mt-1 italic">*Kalkulasi netting hanya menghitung tagihan berstatus 'Belum Bayar'.</p>
                   
                   <div className="mt-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 inline-block">
                     <span className="text-slate-500 font-medium">Bank Tujuan: </span>
                     <span className={`font-bold ${profiles.find(p=>p.id===orangTerpilih)?.nama_bank ? 'text-slate-800' : 'text-rose-500 italic'}`}>
                       {profiles.find(p=>p.id===orangTerpilih)?.nama_bank ? `${profiles.find(p=>p.id===orangTerpilih)?.nama_bank} - ${profiles.find(p=>p.id===orangTerpilih)?.no_rekening}` : 'Belum diisi'}
                     </span>
                   </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => bagikanKeWA(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-sm flex items-center justify-center gap-2">
                    📲 REKAP WA
                  </button>
                  {netMap[orangTerpilih] < 0 && (
                    <div>
                      <input type="file" accept="image/*" className="hidden" id={`upload-batch-${orangTerpilih}`} onChange={handleBatchUpload} />
                      <button onClick={() => document.getElementById(`upload-batch-${orangTerpilih}`)?.click()} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-sm flex items-center justify-center gap-2">
                        🚀 BAYAR SEMUA + UPLOAD
                      </button>
                    </div>
                  )}
                  {netMap[orangTerpilih] > 0 && (
                    <button onClick={() => handleBatchUpdate('approve')} className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-sm flex items-center justify-center gap-2">
                      ✅ APPROVE ALL
                    </button>
                  )}
                </div>
              </div>

              {/* 🌟 SPLIT LAYOUT: SISI KIRI (HUTANG SAYA) & SISI KANAN (PIUTANG SAYA) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                
                {/* 📉 SISI KIRI: HUTANG SAYA KE DIA */}
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-rose-50 px-5 py-3 border-b border-rose-100 flex justify-between items-center">
                    <h4 className="text-xs font-black text-rose-700 uppercase tracking-widest flex items-center gap-1.5">
                      📉 Hutang Saya ({hutangKeOrangTerpilih.length})
                    </h4>
                    <span className="text-rose-700 font-black text-sm">
                       Rp {totalHutangKeOrangTerpilih.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    {hutangKeOrangTerpilih.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        Aman bwang, kamu ga ada hutang ke dia.
                      </div>
                    ) : (
                      hutangKeOrangTerpilih.map(tf => renderCompactRow(tf, true))
                    )}
                  </div>
                </div>

                {/* 📈 SISI KANAN: PIUTANG SAYA KE DIA */}
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-100 flex justify-between items-center">
                    <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                      📈 Piutang Saya ({piutangKeOrangTerpilih.length})
                    </h4>
                    <span className="text-emerald-700 font-black text-sm">
                       Rp {totalPiutangKeOrangTerpilih.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    {piutangKeOrangTerpilih.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        Ga ada tagihan aktif ke dia saat ini.
                      </div>
                    ) : (
                      piutangKeOrangTerpilih.map(tf => renderCompactRow(tf, false))
                    )}
                  </div>
                </div>

              </div>

              {/* 🏦 FOOTER BANK INFO */}
              <div className="mt-6 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-center items-center">
                 <div className="text-xs">
                   <span className="text-slate-500 font-medium">Bank Tujuan Pembayaran: </span>
                   <span className={`font-bold ${profiles.find(p=>p.id===orangTerpilih)?.nama_bank ? 'text-slate-800' : 'text-rose-500 italic'}`}>
                     {profiles.find(p=>p.id===orangTerpilih)?.nama_bank ? `${profiles.find(p=>p.id===orangTerpilih)?.nama_bank} - ${profiles.find(p=>p.id===orangTerpilih)?.no_rekening}` : 'Belum diisi'}
                   </span>
                 </div>
              </div>
            </div>
          ) : viewMode === 'event' && sesiTerpilih ? (
            
            /* ✅ RENDER DETAIL EVENT YANG SEBELUMNYA KOSONG */
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              
              {/* Header Info Acara */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-6 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    {daftarSesi.find(s => s.id === sesiTerpilih)?.nama || 'Acara Tidak Ditemukan'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {daftarSesi.find(s => s.id === sesiTerpilih)?.tanggal}
                  </p>
                </div>
                {tagihanAktif.some(tf => tf.ke_user_id === currentUser?.id && tf.status !== 'Lunas') && (
                  <button onClick={() => bagikanKeWA(false)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black px-4 py-3 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all">
                    📲 TAGIH VIA WA
                  </button>
                )}
              </div>
              
              {/* Looping Kartu Tagihan per Acara */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tagihanAktif.length === 0 ? (
                  <div className="col-span-full p-8 text-center flex flex-col items-center text-slate-400 italic bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                     <span className="text-4xl mb-3 opacity-50">💸</span>
                     <span>Semua tagihan di acara ini sudah selesai/kosong.</span>
                  </div>
                ) : (
                  tagihanAktif.map(tf => renderKartuTagihan(tf))
                )}
              </div>

            </div>

          ) : (
            /* ✅ TAMPILAN DEFAULT SAAT BELUM ADA YANG DIKLIK */
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 pt-20">
              <span className="text-6xl mb-4 animate-bounce">👆</span>
              <p className="font-bold">Pilih daftar di sebelah kiri untuk melihat detail.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}