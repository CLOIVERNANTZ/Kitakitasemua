'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase'; // ✅ Pakai util Supabase kita
import CustomModal from '@/components/CustomModal'; // ✅ Import Modal

// --- INTERFACES ---
interface DetailNalangin { id: string; target_user_id: string; nominal: number; }
interface LapakRow { id: string; nama: string; pemasukan: number; pengeluaran: Record<string, number>; nalangin_details: DetailNalangin[]; }
interface Anggota { id: string; nama: string; }

function BukuLapakContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryId = searchParams?.get('id');
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [anggota, setAnggota] = useState<Anggota[]>([]);

    const [isLoaded, setIsLoaded] = useState(false);
    const [statusSesi, setStatusSesi] = useState('Open'); 
    const [lapakId, setLapakId] = useState('');
    const [namaLapak, setNamaLapak] = useState('');
    const [bendaharaId, setBendaharaId] = useState('');
    const [partisipanIds, setPartisipanIds] = useState<string[]>([]);
    const [coAdminIds, setCoAdminIds] = useState<string[]>([]);
    const [rundown, setRundown] = useState('');
    const [kolomBiaya, setKolomBiaya] = useState<string[]>([]);
    const [rows, setRows] = useState<LapakRow[]>([]);

    const [inputKolomBaru, setInputKolomBaru] = useState('');
    const [isTambahKolom, setIsTambahKolom] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalNalangin, setModalNalangin] = useState<{ isOpen: boolean, rowId: string | null }>({ isOpen: false, rowId: null });

    // ✅ STATE CUSTOM MODAL
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'success' as 'success' | 'error' | 'warning' | 'loading',
        title: '',
        message: '',
        onConfirm: () => {},
        onCancel: undefined as (() => void) | undefined
    });
    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

    const activeRows = rows.filter(r => partisipanIds.includes(r.id));

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setCurrentUser(user);

            const { data: profilesData } = await supabase.from('profiles').select('id, nama');
            const listAnggota = profilesData ? (profilesData as Anggota[]) : [];
            const realIds = listAnggota.map(a => a.id);
            setAnggota(listAnggota);

            const mergeRows = (savedRows: any[]) => {
                let clean = (savedRows || []).filter(r => realIds.includes(r.id));
                listAnggota.forEach(a => {
                    const existing = clean.find(r => r.id === a.id);
                    if (!existing) clean.push({ id: a.id, nama: a.nama || 'User Baru', pemasukan: 0, pengeluaran: {}, nalangin_details: [] });
                    else existing.nama = a.nama || 'User Baru';
                });
                return clean;
            };

            if (queryId) {
                const { data } = await supabase.from('events').select('*').eq('id', queryId).single();
                if (data) {
                    setLapakId(data.id);
                    setNamaLapak(data.nama_acara || '');
                    setStatusSesi(data.status); 
                    
                    if (data.data_ekstra) {
                        setKolomBiaya(data.data_ekstra.kolomBiaya || []);
                        setRundown(data.data_ekstra.rundown || '');
                        setBendaharaId(data.data_ekstra.bendaharaId || listAnggota[0]?.id);
                        setPartisipanIds(data.partisipan_ids || []);
                        setCoAdminIds(data.data_ekstra.coAdminIds || []);
                        setRows(mergeRows(data.data_ekstra.rows || []));
                    }
                    setIsProjectOpen(true);
                }
            } else {
                const draft = localStorage.getItem('db_draft_lapak');
                if (draft) {
                    const data = JSON.parse(draft);
                    setLapakId(data.lapakId || 'lapak-live-' + Date.now());
                    setNamaLapak(data.namaLapak || '');
                    setStatusSesi('Open');
                    setBendaharaId(realIds.includes(data.bendaharaId) ? data.bendaharaId : (listAnggota[0]?.id || ''));
                    setPartisipanIds(data.partisipanIds || []);
                    setCoAdminIds(data.coAdminIds || []);
                    setKolomBiaya(data.kolomBiaya || []);
                    setRows(mergeRows(data.rows));
                    if (data.namaLapak) setIsProjectOpen(true);
                } else {
                    setLapakId('lapak-live-' + Date.now());
                    setStatusSesi('Open');
                    setBendaharaId(listAnggota[0]?.id || '');
                    setRows(mergeRows([]));
                }
            }
            setIsLoaded(true);
        };
        init();
    }, [queryId]);

    const getTotalPengeluaranUser = (row: LapakRow) => kolomBiaya.reduce((sum, col) => sum + (row.pengeluaran[col] || 0), 0);
    const getSumNalangin = (details: DetailNalangin[]) => details.reduce((sum, d) => sum + d.nominal, 0);
    const getTotalDitalangin = (userId: string) => {
        let sum = 0;
        activeRows.forEach(r => { r.nalangin_details.forEach(d => { if (d.target_user_id === userId) sum += d.nominal; }); });
        return sum;
    };
    const getSisaKeseluruhan = (row: LapakRow) => row.pemasukan - getTotalPengeluaranUser(row) + getSumNalangin(row.nalangin_details) - getTotalDitalangin(row.id);
    const sumKolom = (colName: string) => activeRows.reduce((sum, r) => sum + (r.pengeluaran[colName] || 0), 0);

    const handleSplitBiayaMassa = (colName: string, value: string) => {
        if (statusSesi === 'Closed') return;
        const total = Number(value.replace(/\D/g, ''));
        const activeCount = partisipanIds.length;
        const perOrang = activeCount > 0 ? total / activeCount : 0;
        setRows(prev => prev.map(r => partisipanIds.includes(r.id) ? { ...r, pengeluaran: { ...r.pengeluaran, [colName]: perOrang } } : r));
    };

    useEffect(() => {
        if (!isLoaded || !isProjectOpen || statusSesi === 'Closed') return;
        setIsSaving(true);
        const delayDebounceFn = setTimeout(async () => {
            const activeRowsToSave = rows.filter(r => partisipanIds.includes(r.id));
            const totalPengeluaranLapak = activeRowsToSave.reduce((sum, r) => sum + getTotalPengeluaranUser(r), 0);

            await supabase.from('events').upsert({
                id: lapakId,
                tipe_acara: 'PROJECT',
                nama_acara: namaLapak,
                total_biaya: totalPengeluaranLapak,
                partisipan_ids: partisipanIds,
                data_ekstra: { rows, kolomBiaya, rundown, bendaharaId, coAdminIds }
            });

            const draftData = { lapakId, namaLapak, bendaharaId, partisipanIds, coAdminIds, kolomBiaya, rows, rundown };
            localStorage.setItem('db_draft_lapak', JSON.stringify(draftData));
            setIsSaving(false);
        }, 800);
        return () => clearTimeout(delayDebounceFn);
    }, [isLoaded, isProjectOpen, rows, kolomBiaya, partisipanIds, bendaharaId, namaLapak, coAdminIds, rundown, lapakId, statusSesi]);

    const togglePartisipan = (id: string) => {
        if (statusSesi === 'Closed') return;
        setPartisipanIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    };
    const toggleCoAdmin = (id: string) => {
        if (statusSesi === 'Closed') return;
        setCoAdminIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    };

    const handleSimpanKolomBaru = (e: React.FormEvent) => {
        e.preventDefault();
        if (statusSesi === 'Closed') return;
        if (inputKolomBaru && !kolomBiaya.includes(inputKolomBaru)) {
            setKolomBiaya([...kolomBiaya, inputKolomBaru]);
            setRows(rows.map(r => ({ ...r, pengeluaran: { ...r.pengeluaran, [inputKolomBaru]: 0 } })));
        }
        setInputKolomBaru('');
        setIsTambahKolom(false);
    };

    // ✅ DIGANTI DENGAN CUSTOM MODAL
    const hapusKolom = (colNameToDelete: string) => {
        if (statusSesi === 'Closed') return;
        setModal(prev => ({
            ...prev, isOpen: true, type: 'warning', title: 'Hapus Kolom?', 
            message: `Hapus kolom "${colNameToDelete}" dari pengeluaran?`,
            onCancel: closeModal,
            onConfirm: () => {
                setKolomBiaya(kolomBiaya.filter(c => c !== colNameToDelete));
                setRows(rows.map(r => {
                    const newPengeluaran = { ...r.pengeluaran };
                    delete newPengeluaran[colNameToDelete];
                    return { ...r, pengeluaran: newPengeluaran };
                }));
                closeModal();
            }
        }));
    };

    const updateSel = (rowId: string, value: string) => {
        if (statusSesi === 'Closed') return;
        setRows(rows.map(r => r.id === rowId ? { ...r, pemasukan: Number(value.replace(/\D/g, '')) } : r));
    };
    const updatePengeluaran = (rowId: string, colName: string, value: string) => {
        if (statusSesi === 'Closed') return;
        setRows(rows.map(r => r.id === rowId ? { ...r, pengeluaran: { ...r.pengeluaran, [colName]: Number(value.replace(/\D/g, '')) } } : r));
    };
    const tambahBarisNalangin = (rowId: string) => {
        if (statusSesi === 'Closed') return;
        setRows(rows.map(r => r.id === rowId ? { ...r, nalangin_details: [...r.nalangin_details, { id: 'nd_' + Date.now(), target_user_id: '', nominal: 0 }] } : r));
    };
    const updateBarisNalangin = (rowId: string, detailId: string, field: 'target_user_id' | 'nominal', value: string) => {
        if (statusSesi === 'Closed') return;
        setRows(rows.map(r => r.id === rowId ? { ...r, nalangin_details: r.nalangin_details.map(d => d.id === detailId ? { ...d, [field]: field === 'nominal' ? Number(value.replace(/\D/g, '')) : value } : d) } : r));
    };
    const hapusBarisNalangin = (rowId: string, detailId: string) => {
        if (statusSesi === 'Closed') return;
        setRows(rows.map(r => r.id === rowId ? { ...r, nalangin_details: r.nalangin_details.filter(d => d.id !== detailId) } : r));
    };

    // ✅ DIGANTI DENGAN CUSTOM MODAL
    const resetProject = () => {
        setModal(prev => ({
            ...prev, isOpen: true, type: 'warning', title: 'Buat Baru?', 
            message: 'Keluar dari halaman ini dan buat proyek kosong baru?',
            onCancel: closeModal,
            onConfirm: () => {
                localStorage.removeItem('db_draft_lapak');
                router.push('/dashboard/lapak');
                window.location.reload(); 
            }
        }));
    };

    // ✅ FITUR : EXPORT PDF
    
    const handleExportPDF = async () => {
        const element = document.getElementById('area-export-pdf');
        if (!element) return;
        
        // Modal loading
        setModal(prev => ({ ...prev, isOpen: true, type: 'loading', title: 'Menyiapkan Dokumen...', message: 'Sedang memproses PDF...', onCancel: undefined }));
        
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            
           
            const opt: any = {
                margin:       0.2,
                filename:     `Laporan_${namaLapak}_${Date.now()}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
            };
            
            await html2pdf().set(opt).from(element).save();
            setModal(prev => ({ ...prev, isOpen: true, type: 'success', title: 'Berhasil!', message: 'File PDF berhasil diunduh.', onConfirm: closeModal }));
        } catch (err) {
            setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Gagal Export', message: 'Pastikan html2pdf.js sudah terinstall.', onConfirm: closeModal }));
        }
    };

    // ✅ DIGANTI DENGAN CUSTOM MODAL
    const handleTutupProjectDanTagih = async () => {
        if (!bendaharaId) return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Oops!', message: 'Tentukan Bendahara Utama sebelum menutup proyek!', onConfirm: closeModal }));
        if (partisipanIds.length === 0) return setModal(prev => ({ ...prev, isOpen: true, type: 'error', title: 'Oops!', message: 'Tidak ada partisipan di proyek ini.', onConfirm: closeModal }));

        setModal(prev => ({
            ...prev, isOpen: true, type: 'warning', title: 'Tutup Permanen?', 
            message: 'Tutup proyek lapak ini? Seluruh teman yang memiliki saldo minus otomatis akan mendapatkan tagihan resmi ke Bendahara.',
            onCancel: closeModal,
            onConfirm: async () => {
                setModal(p => ({ ...p, isOpen: true, type: 'loading', title: 'Memproses...', message: 'Menutup sesi dan menyiapkan tagihan...', onCancel: undefined }));
                
                const newTransfers: any[] = [];
                activeRows.forEach(row => {
                    const sisa = getSisaKeseluruhan(row);
                    if (sisa < 0 && row.id !== bendaharaId) {
                        newTransfers.push({
                            id: `tf_${row.id}_to_${bendaharaId}_${lapakId}`,
                            event_id: lapakId,
                            dari_user_id: row.id,
                            ke_user_id: bendaharaId,
                            nominal: Math.abs(sisa),
                            status: 'Belum Bayar'
                        });
                    }
                });

                if (newTransfers.length > 0) {
                    const { error: tfError } = await supabase.from('tagihan').insert(newTransfers);
                    if (tfError) {
                        return setModal(p => ({ ...p, isOpen: true, type: 'error', title: 'Gagal', message: tfError.message, onConfirm: closeModal }));
                    }
                }

                const { error: eventError } = await supabase.from('events').update({ status: 'Closed' }).eq('id', lapakId);
                
                if (!eventError) {
                    setStatusSesi('Closed');
                    setModal(p => ({ ...p, isOpen: true, type: 'success', title: 'Terkunci!', message: 'Proyek Lapak resmi ditutup. Tagihan telah disebar.', onConfirm: closeModal }));
                }
            }
        }));
    };

    const sumPemasukan = activeRows.reduce((sum, r) => sum + r.pemasukan, 0);
    const sumNalanginTotal = activeRows.reduce((sum, r) => sum + getSumNalangin(r.nalangin_details), 0);
    const sumDitalanginTotal = activeRows.reduce((sum, r) => sum + getTotalDitalangin(r.id), 0);
    const sumTotalPengeluaran = activeRows.reduce((sum, r) => sum + getTotalPengeluaranUser(r), 0);
    const sumSisaAkhir = activeRows.reduce((sum, r) => sum + getSisaKeseluruhan(r), 0);

    const activeModalRow = rows.find(r => r.id === modalNalangin.rowId);

    if (!isLoaded) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan Tabel Excel...</div>;

    return (
        <div className="p-4 sm:p-8 min-h-screen text-slate-900 pb-20 w-full overflow-hidden flex flex-col relative bg-slate-50">
            <CustomModal {...modal} /> {/* ✅ RENDER MODAL UTAMA */}

            {/* MODAL NALANGIN */}
            {modalNalangin.isOpen && activeModalRow && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg">Rincian Nalangin: <span className="text-blue-600">{activeModalRow.nama}</span></h3>
                            <button onClick={() => setModalNalangin({ isOpen: false, rowId: null })} className="text-slate-400 hover:text-slate-700 font-bold text-xl touch-manipulation">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {activeModalRow.nalangin_details.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-sm italic border-2 border-dashed rounded-xl">Belum ada rincian ditalangi.</div>
                            ) : (
                                activeModalRow.nalangin_details.map((detail) => (
                                    <div key={detail.id} className="flex gap-3 items-start bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                        <div className="flex-1 space-y-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">PIC (Yang Ditalangi)</label>
                                                <select disabled={statusSesi === 'Closed'} value={detail.target_user_id} onChange={(e) => updateBarisNalangin(activeModalRow.id, detail.id, 'target_user_id', e.target.value)} className="w-full text-sm font-semibold border rounded-lg p-3 bg-white disabled:bg-slate-100 outline-none">
                                                    <option value="">-- Pilih PIC --</option>
                                                    {anggota.filter(a => a.id !== activeModalRow.id && partisipanIds.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Nominal</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-3 text-sm text-slate-400 font-bold">Rp</span>
                                                    <input disabled={statusSesi === 'Closed'} type="text" value={detail.nominal === 0 ? '' : detail.nominal.toLocaleString('id-ID')} onChange={(e) => updateBarisNalangin(activeModalRow.id, detail.id, 'nominal', e.target.value)} placeholder="0" className="w-full pl-9 pr-3 py-3 text-sm font-bold border disabled:bg-slate-100 rounded-lg outline-none" />
                                                </div>
                                            </div>
                                        </div>
                                        {statusSesi === 'Open' && (
                                            <button onClick={() => hapusBarisNalangin(activeModalRow.id, detail.id)} className="mt-6 bg-white border border-rose-200 text-rose-500 p-3 rounded-lg hover:bg-rose-50 transition-colors">✕</button>
                                        )}
                                    </div>
                                ))
                            )}
                            {statusSesi === 'Open' && (
                                <button onClick={() => tambahBarisNalangin(activeModalRow.id)} className="w-full py-4 border-2 border-dashed border-blue-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm">+ Tambah PIC yang Ditalangi</button>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t bg-slate-50 flex justify-between items-center">
                            <div><div className="text-xs font-bold text-slate-500 uppercase">Total Nalangin</div><div className="text-xl font-black text-blue-700">Rp {getSumNalangin(activeModalRow.nalangin_details).toLocaleString('id-ID')}</div></div>
                            <button onClick={() => setModalNalangin({ isOpen: false, rowId: null })} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-slate-800">Selesai</button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER UTAMA */}
            <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
                        📊 Project Lapak 
                        {statusSesi === 'Closed' && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-md uppercase tracking-widest mt-1">Read-Only</span>}
                    </h2>
                    <p className="text-slate-500 mt-1">Laporan Excel live yang membagi biaya otomatis.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* ✅ TOMBOL EXPORT PDF */}
                    {isProjectOpen && (
                        <button onClick={handleExportPDF} className="text-xs font-bold text-slate-700 bg-white px-3 py-2.5 rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 flex items-center gap-1">
                            📄 Export PDF
                        </button>
                    )}

                    {isProjectOpen && statusSesi === 'Open' && (currentUser?.id === bendaharaId || coAdminIds.includes(currentUser?.id)) && (
                        <button onClick={handleTutupProjectDanTagih} className="text-xs font-bold text-white bg-rose-600 px-3 py-2.5 rounded-xl shadow-sm hover:bg-rose-700 flex items-center gap-1">
                            🔒 Kunci & Tagih
                        </button>
                    )}
                    {isProjectOpen && (
                        isSaving ? <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-2.5 rounded-xl animate-pulse border border-amber-200">⏳ Menyimpan...</span>
                        : statusSesi === 'Open' ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-200">✅ Sinkron</span> : null
                    )}
                    <button onClick={resetProject} className="bg-white border border-slate-200 text-slate-600 text-sm font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50">
                        + Baru
                    </button>
                    <Link href="/dashboard/riwayat" className="bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg hover:bg-slate-800 flex items-center justify-center">
                        Cek Tagihan ➔
                    </Link>
                </div>
            </header>

            {/* HALAMAN 1: SETUP KARTU */}
            {!isProjectOpen ? (
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-2xl mx-auto mt-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-blue-500"></div>
                    <div className="text-center mb-8"><div className="text-4xl mb-3">📁</div><h3 className="text-2xl font-bold text-slate-900">Mulai Project Baru</h3><p className="text-sm text-slate-500 mt-1">Isi detail acara sebelum membuka tabel pengeluaran.</p></div>
                    <div className="space-y-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Nama Acara / Project (Wajib)</label><input disabled={statusSesi === 'Closed'} type="text" placeholder="Contoh: Trip Bromo 2026" value={namaLapak} onChange={(e) => setNamaLapak(e.target.value)} className="w-full font-bold text-lg bg-slate-50 border border-slate-200 disabled:bg-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 min-h-[44px]" /></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Pilih PIC / Partisipan</label><div className="flex flex-wrap gap-2 p-4 border border-slate-200 rounded-xl bg-slate-50">{anggota.map(a => (<label key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${statusSesi === 'Open' ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${partisipanIds.includes(a.id) ? 'bg-blue-100 border-blue-300' : 'bg-white border-slate-200'}`}><input disabled={statusSesi === 'Closed'} type="checkbox" checked={partisipanIds.includes(a.id)} onChange={() => togglePartisipan(a.id)} className="w-4 h-4 text-blue-600 rounded" /><span className={`text-sm ${partisipanIds.includes(a.id) ? 'font-bold text-blue-900' : 'text-slate-600'}`}>{a.nama}</span></label>))}</div></div>
                        <div className="mt-6"><label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Pilih Co-Admin (Bisa ikut edit data)</label><div className="flex flex-wrap gap-2 p-4 border border-slate-200 rounded-xl bg-slate-50">{anggota.filter((a) => partisipanIds.includes(a.id)).map((a) => (<label key={`coadmin-${a.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${statusSesi === 'Open' ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${coAdminIds.includes(a.id) ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'}`}><input disabled={statusSesi === 'Closed'} type="checkbox" checked={coAdminIds.includes(a.id)} onChange={() => toggleCoAdmin(a.id)} className="w-4 h-4 text-amber-600 rounded" /><span className={`text-sm ${coAdminIds.includes(a.id) ? 'font-bold text-amber-900' : 'text-slate-600'}`}>{a.nama}</span></label>))}</div></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Bendahara Utama (Tujuan Uang Sisa Minus)</label><select disabled={statusSesi === 'Closed'} value={bendaharaId} onChange={(e) => setBendaharaId(e.target.value)} className="w-full font-bold text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500">{anggota.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></div>
                        <button onClick={() => setIsProjectOpen(true)} disabled={!namaLapak || partisipanIds.length === 0} className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-lg shadow-lg disabled:opacity-50 transition-all flex justify-center gap-2">🚀 Buka Tabel Excel Project</button>
                    </div>
                </div>
            ) : (
                /* ✅ BUNGKUS DENGAN DIV ID="area-export-pdf" AGAR BISA DI-EXPORT */
                <div id="area-export-pdf" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                        <div><h3 className="font-black text-xl text-slate-900">{namaLapak}</h3><p className="text-sm text-slate-500 font-medium">{partisipanIds.length} Partisipan • Bendahara: {anggota.find(a => a.id === bendaharaId)?.nama}</p></div>
                        {statusSesi === 'Open' && (<button onClick={() => setIsProjectOpen(false)} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-100" data-html2canvas-ignore>✏️ Edit Info Project</button>)}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-2" data-html2canvas-ignore>
                        <h3 className="font-bold text-lg text-slate-900">Rincian Pengeluaran</h3>
                        <div className="relative w-full sm:w-auto">
                            {statusSesi === 'Open' && (isTambahKolom ? (<form onSubmit={handleSimpanKolomBaru} className="flex items-center bg-white border border-blue-300 rounded-lg overflow-hidden shadow-md"><input type="text" autoFocus placeholder="Nama Item (Cth: Tol)" value={inputKolomBaru} onChange={(e) => setInputKolomBaru(e.target.value)} className="px-3 py-2 text-sm focus:outline-none flex-1 font-medium min-h-[44px]" /><button type="submit" className="bg-blue-600 text-white px-4 py-2 font-bold min-h-[44px]">Simpan</button><button type="button" onClick={() => setIsTambahKolom(false)} className="bg-slate-100 text-slate-600 px-4 py-2 font-bold min-h-[44px]">X</button></form>) : (<button onClick={() => setIsTambahKolom(true)} className="w-full sm:w-auto justify-center bg-blue-100 text-blue-700 font-bold px-4 py-3 rounded-xl hover:bg-blue-200 text-sm border shadow-sm flex items-center gap-1">+ Tambah Kolom Biaya</button>))}
                        </div>
                    </div>

                    {/* TAMPILAN 1: MOBILE (Disembunyikan saat Export PDF) */}
                    <div className="block md:hidden space-y-4 mb-6" data-html2canvas-ignore>
                        {activeRows.length === 0 ? (<div className="text-center py-12 bg-white rounded-2xl border text-slate-400 italic text-sm">Pilih minimal 1 orang.</div>) : (
                            <>
                                {activeRows.map((row) => {
                                    const sisa = getSisaKeseluruhan(row);
                                    return (
                                        <div key={row.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                            <div className="flex justify-between items-center border-b pb-3"><h4 className="font-bold text-slate-800 text-lg">{row.nama} {row.id === bendaharaId && '👑'}</h4><div className={`font-black text-xl ${sisa < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{sisa < 0 ? '' : '+'}{Math.round(sisa).toLocaleString('id-ID')}</div></div>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Deposit</label><input disabled={statusSesi === 'Closed'} type="text" value={row.pemasukan === 0 ? '' : row.pemasukan.toLocaleString('id-ID')} onChange={(e) => updateSel(row.id, e.target.value)} placeholder="0" className="w-full px-2 py-2 bg-emerald-50 border rounded-lg outline-none font-semibold text-emerald-800" /></div>
                                                <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Nalangin</label><button onClick={() => setModalNalangin({ isOpen: true, rowId: row.id })} className="w-full text-left px-2 py-2 bg-blue-50 border rounded-lg text-blue-800 font-semibold">{getSumNalangin(row.nalangin_details) === 0 ? '+ Input Detail' : `Rp ${getSumNalangin(row.nalangin_details).toLocaleString('id-ID')}`}</button></div>
                                            </div>
                                            {kolomBiaya.length > 0 && (
                                                <div className="pt-3 mt-1 border-t border-dashed">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Pengeluaran Individu</label>
                                                    <div className="space-y-2">
                                                        {kolomBiaya.map(col => (
                                                            <div key={col} className="flex justify-between items-center gap-2"><span className="text-sm font-medium text-slate-600 truncate w-1/2">{col}</span><input disabled={statusSesi === 'Closed'} type="text" value={row.pengeluaran[col] === 0 || !row.pengeluaran[col] ? '' : Math.round(row.pengeluaran[col]).toLocaleString('id-ID')} onChange={(e) => updatePengeluaran(row.id, col, e.target.value)} placeholder="-" className="w-1/2 px-2 py-2 bg-slate-50 border rounded-lg outline-none text-slate-700 text-right text-sm" /></div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* TAMPILAN 2: DESKTOP (TABEL YANG DI EXPORT) */}
                    <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto flex-1 relative mb-6">
                        <table className="w-full text-sm text-right whitespace-nowrap min-w-max border-collapse">
                            <thead className="bg-slate-800 text-white">
                                <tr>
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 text-left bg-slate-900">Nama Anggota</th>
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 bg-emerald-700/80">Pemasukan</th>
                                    {kolomBiaya.length > 0 && <th colSpan={kolomBiaya.length} className="px-4 py-1.5 border border-slate-700 text-center bg-rose-900/80">Pengeluaran Individu</th>}
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 bg-rose-900/80">Total Keluar</th>
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 bg-blue-900/80">Nalangin</th>
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 bg-purple-900/80">Ditalangin</th>
                                    <th rowSpan={2} className="px-4 py-3 border border-slate-700 bg-slate-900">Total Sisa</th>
                                </tr>
                                <tr>
                                    {kolomBiaya.map(col => (
                                        <th key={col} className="px-2 py-2 border border-slate-700 bg-rose-800/60 font-semibold relative text-center group/th">
                                            {col}
                                            {statusSesi === 'Open' && (<button onClick={() => hapusKolom(col)} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover/th:opacity-100" data-html2canvas-ignore>✕</button>)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {activeRows.length === 0 ? (<tr><td colSpan={10} className="text-center py-12 text-slate-400 italic">Data kosong.</td></tr>) : (
                                    activeRows.map((row) => {
                                        const sisa = getSisaKeseluruhan(row);
                                        return (
                                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2.5 border border-slate-200 font-bold text-slate-800 text-left bg-white">{row.nama} {row.id === bendaharaId && '👑'}</td>
                                                <td className="px-2 py-1 border border-slate-200 bg-emerald-50/30"><input disabled={statusSesi === 'Closed'} type="text" value={row.pemasukan === 0 ? '' : row.pemasukan.toLocaleString('id-ID')} onChange={(e) => updateSel(row.id, e.target.value)} placeholder="0" className="w-full text-right bg-transparent outline-none px-2 py-1.5 rounded font-medium text-emerald-800" /></td>
                                                {kolomBiaya.map(col => (
                                                    <td key={col} className="px-2 py-1 border border-slate-200"><input disabled={statusSesi === 'Closed'} type="text" value={row.pengeluaran[col] === 0 || !row.pengeluaran[col] ? '' : Math.round(row.pengeluaran[col]).toLocaleString('id-ID')} onChange={(e) => updatePengeluaran(row.id, col, e.target.value)} placeholder="-" className="w-full text-right bg-transparent outline-none px-2 py-1.5 rounded text-slate-700" /></td>
                                                ))}
                                                <td className="px-4 py-2.5 border border-slate-200 bg-rose-50/50 font-bold text-rose-700">{getTotalPengeluaranUser(row).toLocaleString('id-ID')}</td>
                                                <td className="px-2 py-1 border border-slate-200 bg-blue-50/30"><button onClick={() => setModalNalangin({ isOpen: true, rowId: row.id })} className="w-full text-right font-bold text-blue-800">{getSumNalangin(row.nalangin_details) === 0 ? '+ Input' : getSumNalangin(row.nalangin_details).toLocaleString('id-ID')}</button></td>
                                                <td className="px-4 py-2.5 border border-slate-200 bg-purple-50/30 font-bold text-purple-700">{getTotalDitalangin(row.id) > 0 ? `-${getTotalDitalangin(row.id).toLocaleString('id-ID')}` : '-'}</td>
                                                <td className={`px-4 py-2.5 border border-slate-200 font-black ${sisa < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{sisa < 0 ? '' : '+'}{Math.round(sisa).toLocaleString('id-ID')}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {activeRows.length > 0 && (
                                <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                                    <tr>
                                        <td className="px-4 py-4 border text-center text-sm">TOTAL BIAYA<br/><span className="text-[9px] text-blue-600 bg-blue-100 px-1.5 rounded block mt-1" data-html2canvas-ignore>(Ketik untuk Bagi Rata) ➔</span></td>
                                        <td className="px-4 py-4 border text-emerald-700 text-base">{sumPemasukan.toLocaleString('id-ID')}</td>
                                        {kolomBiaya.map(col => (
                                            <td key={col} className="px-2 py-2 border bg-blue-50/50" data-html2canvas-ignore>
                                                <input disabled={statusSesi === 'Closed'} type="text" value={sumKolom(col) === 0 ? '' : Math.round(sumKolom(col)).toLocaleString('id-ID')} onChange={(e) => handleSplitBiayaMassa(col, e.target.value)} placeholder="Bagi Rata..." className="w-full text-right font-black text-blue-700 bg-transparent outline-none px-2 py-2 rounded-lg" />
                                            </td>
                                        ))}
                                        <td className="px-4 py-4 border text-rose-700 text-base">{Math.round(sumTotalPengeluaran).toLocaleString('id-ID')}</td>
                                        <td className="px-4 py-4 border text-blue-700 text-base">{Math.round(sumNalanginTotal).toLocaleString('id-ID')}</td>
                                        <td className="px-4 py-4 border text-purple-700 text-base">{sumDitalanginTotal > 0 ? `-${Math.round(sumDitalanginTotal).toLocaleString('id-ID')}` : '0'}</td>
                                        <td className={`px-4 py-4 border font-black text-lg ${sumSisaAkhir < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{sumSisaAkhir < 0 ? '' : '+'}{Math.round(sumSisaAkhir).toLocaleString('id-ID')}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
                        <h3 className="font-bold text-lg text-slate-900 mb-3 flex items-center gap-2"><span>📝</span> Rundown & Catatan Lapak</h3>
                        <textarea disabled={statusSesi === 'Closed'} value={rundown} onChange={(e) => setRundown(e.target.value)} placeholder="Tulis rundown perjalanan, bukti catatan, atau aturan lapak di sini..." className="w-full flex-1 min-h-[150px] p-4 bg-slate-50 disabled:bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm leading-relaxed resize-y" />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BukuLapakPage() {
    return (
        <Suspense fallback={<div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menyiapkan Tabel Excel...</div>}>
            <BukuLapakContent />
        </Suspense>
    );
}