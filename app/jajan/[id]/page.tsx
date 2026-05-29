'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

// --- INTERFACE DATA ---
interface Anggota {
  id: string;
  nama: string;
  sponsor_utama_id?: string;
  nama_bank?: string;
  no_rekening?: string;
}

type TipePembagian = 'sendiri' | 'dibagi_rata' | 'dibebankan';

interface ItemPesanan {
  id: string; user_id: string; nama_menu: string; catatan: string; harga: number; qty: number;
  tipe_pembagian: TipePembagian; penanggung_id: string; is_ppn_included: boolean; ppn_rate: number; sudah_diterima: boolean;
}
interface DetailStruk { id_item: string; tipe: string; deskripsi: string; nominal: number; }

export default function SesiJajanPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [activeTab, setActiveTab] = useState<'pemesanan' | 'hasil' | 'rekapan'>('pemesanan');
  const [isSesiOpen, setIsSesiOpen] = useState(false);
  const [statusSesi, setStatusSesi] = useState('Open');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [daftarWarung, setDaftarWarung] = useState<string[]>([]);

  const [anggota, setAnggota] = useState<Anggota[]>([]);

  const [namaSesi, setNamaSesi] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [warungTerpilih, setWarungTerpilih] = useState('');
  const [pahlawanIds, setPahlawanIds] = useState<string[]>([]);
  const [items, setItems] = useState<ItemPesanan[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [hargaInput, setHargaInput] = useState<string>('');

  const [formItem, setFormItem] = useState<Omit<ItemPesanan, 'id' | 'harga' | 'sudah_diterima'>>({
    user_id: '1', nama_menu: '', catatan: '', qty: 1, tipe_pembagian: 'sendiri', penanggung_id: '',
    is_ppn_included: true, ppn_rate: 11
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setCurrentUser(user);
      
      const { data: profilesData } = await supabase.from('profiles').select('id, nama, nama_bank, no_rekening');
      if (profilesData) {
        setAnggota(profilesData as Anggota[]);
        setPahlawanIds(prev => prev.length === 0 ? [user.id] : prev);
      }

      const { data: warungData } = await supabase.from('warung').select('nama');
      if (warungData) setDaftarWarung(warungData.map(w => w.nama));

      if (sessionId) {
        const { data: eventData } = await supabase.from('events').select('*').eq('id', sessionId).single();
        if (eventData) {
          setNamaSesi(eventData.nama_acara);
          setTanggal(eventData.tanggal);
          setPahlawanIds(eventData.pahlawan_ids || []);
          setStatusSesi(eventData.status);

          if (eventData.data_ekstra) {
            setWarungTerpilih(eventData.data_ekstra.warung || '');
            setItems(eventData.data_ekstra.items || []);
          }
          setIsSesiOpen(true);
        }
      }
    };

    fetchInitialData();

    // Listener Real-time
    const channel = supabase
      .channel(`jajan-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${sessionId}` },
        (payload) => {
          const updatedData = payload.new as any;
          if (updatedData.data_ekstra) {
            setItems(updatedData.data_ekstra.items || []);
            setWarungTerpilih(updatedData.data_ekstra.warung || '');
          }
          setPahlawanIds(updatedData.pahlawan_ids || []);
          setStatusSesi(updatedData.status || 'Open');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, router]);

  const simpanInformasiSesiKeDB = async (newPahlawanIds: string[] = pahlawanIds, newItems: ItemPesanan[] = items) => {
    if (statusSesi === 'Closed') return; // Mencegah update jika sudah ditutup

    const creatorId = currentUser?.id ? [currentUser.id] : [];
    const partisipanSet = new Set([...creatorId, ...newPahlawanIds, ...newItems.map(i => i.user_id)]);
    const partisipanArray = Array.from(partisipanSet);

    if (warungTerpilih && !daftarWarung.includes(warungTerpilih)) {
      const { error: warungErr } = await supabase.from('warung').insert({ nama: warungTerpilih });
      if (!warungErr) setDaftarWarung(prev => [...prev, warungTerpilih]);
    }

    const totalSementara = newItems.reduce((sum, item) => {
      const base = item.harga * item.qty;
      const ppn = item.is_ppn_included ? 0 : (base * item.ppn_rate / 100);
      return sum + base + ppn;
    }, 0);

    await supabase.from('events').upsert({
      id: sessionId,
      tipe_acara: 'JAJAN',
      nama_acara: namaSesi || 'Sesi Jajan Tanpa Nama',
      tanggal: tanggal,
      status: statusSesi,
      total_biaya: totalSementara,
      pahlawan_ids: newPahlawanIds,
      partisipan_ids: partisipanArray,
      data_ekstra: { items: newItems, warung: warungTerpilih }
    });
  };

  const handleTutupSesiDanTagih = async () => {
    if (pahlawanIds.length === 0) return alert('Pilih minimal 1 Pahlawan yang menalangi sebelum menutup sesi!');
    if (items.length === 0) return alert('Keranjang masih kosong, tidak ada tagihan untuk disebar!');
    if (!window.confirm('Tutup sesi jajan ini? Status akan dikunci dan tagihan final akan dikirim ke teman-teman.')) return;

    const newSessionTransfers: any[] = [];

    rekapanAkhir.forEach(m => {
      if (!pahlawanIds.includes(m.id) && m.totalBeban > 0) {
        const nominalPerPahlawan = m.totalBeban / pahlawanIds.length;
        pahlawanIds.forEach(pid => {
          newSessionTransfers.push({
            id: `tf_${m.id}_to_${pid}_${sessionId}`,
            event_id: sessionId,
            dari_user_id: m.id,
            ke_user_id: pid,
            nominal: nominalPerPahlawan,
            status: 'Belum Bayar'
          });
        });
      }
    });

    if (newSessionTransfers.length > 0) {
      const { error: tfError } = await supabase.from('tagihan').insert(newSessionTransfers);
      if (tfError) {
        alert("Gagal menyebarkan tagihan: " + tfError.message);
        return;
      }
    }

    const { error: eventError } = await supabase
      .from('events')
      .update({ status: 'Closed' })
      .eq('id', sessionId);

    if (!eventError) {
      setStatusSesi('Closed');
      alert('Sesi berhasil ditutup! Tagihan resmi disebarkan.');
      setActiveTab('rekapan');
    }
  };

  const handleBukaSesi = async () => {
    setIsSesiOpen(true);
    await simpanInformasiSesiKeDB();
  };

  const handleHargaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHargaInput(e.target.value.replace(/\D/g, ''));
  };

  const togglePahlawan = async (id: string) => {
    if (statusSesi === 'Closed') return;
    const newPahlawanIds = pahlawanIds.includes(id) ? pahlawanIds.filter(pid => pid !== id) : [...pahlawanIds, id];
    setPahlawanIds(newPahlawanIds);
    if (isSesiOpen) await simpanInformasiSesiKeDB(newPahlawanIds, items);
  };

  const toggleDiterima = async (itemId: string) => {
    if (statusSesi === 'Closed') return;
    const newItems = items.map(i => i.id === itemId ? { ...i, sudah_diterima: !i.sudah_diterima } : i);
    setItems(newItems);
    await simpanInformasiSesiKeDB(pahlawanIds, newItems);
  };

  const hitungRekapan = () => {
    let totalSesi = 0;
    const strukPerOrang: Record<string, DetailStruk[]> = {};
    anggota.forEach(a => { strukPerOrang[a.id] = []; });

    items.forEach(item => {
      const baseTotal = item.harga * item.qty;
      const ppnTotal = item.is_ppn_included ? 0 : (baseTotal * item.ppn_rate / 100);
      const totalHargaItem = baseTotal + ppnTotal;
      totalSesi += totalHargaItem;
      const pemesan = anggota.find(a => a.id === item.user_id);
      if (!pemesan) return;

      const bebankanKeOrang = (targetId: string, nominal: number, tipe: string, deskripsi: string) => {
        const target = anggota.find(a => a.id === targetId);
        const teksPpn = !item.is_ppn_included && item.harga > 0 ? ` (+PPN ${item.ppn_rate}%)` : '';
        if (target?.sponsor_utama_id) {
          strukPerOrang[target.sponsor_utama_id].push({ id_item: item.id, tipe: tipe === 'Bagi Rata' ? 'Tanggungan Bagi Rata' : 'Tanggungan', deskripsi: `${deskripsi}${teksPpn} (${target.nama})`, nominal });
        } else {
          strukPerOrang[targetId].push({ id_item: item.id, tipe, deskripsi: `${deskripsi}${teksPpn}`, nominal });
        }
      };

      if (item.tipe_pembagian === 'sendiri') bebankanKeOrang(pemesan.id, totalHargaItem, 'Pribadi', item.nama_menu);
      else if (item.tipe_pembagian === 'dibebankan' && item.penanggung_id) strukPerOrang[item.penanggung_id].push({ id_item: item.id, tipe: 'Traktir', deskripsi: `${item.nama_menu} (Traktir ${pemesan.nama})`, nominal: totalHargaItem });
      else if (item.tipe_pembagian === 'dibagi_rata') {
        const perOrang = totalHargaItem / anggota.length;
        anggota.forEach(a => bebankanKeOrang(a.id, perOrang, 'Bagi Rata', item.nama_menu));
      }
    });

    const rekapanAkhir = anggota.map(a => {
      const Glen = strukPerOrang[a.id];
      return { ...a, isPahlawan: pahlawanIds.includes(a.id), struk: Glen, totalBeban: Glen.reduce((sum, current) => sum + current.nominal, 0) };
    });
    return { totalSesi, rekapanAkhir };
  };

  const { totalSesi, rekapanAkhir } = hitungRekapan();

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (statusSesi === 'Closed') return;
    const finalHarga = hargaInput === '' ? 0 : Number(hargaInput);
    const newItems = editingId ? items.map(item => item.id === editingId ? { ...item, ...formItem, harga: finalHarga } : item) : [...items, { id: 'idx_' + Date.now(), ...formItem, harga: finalHarga, sudah_diterima: false }];

    setEditingId(null);
    setItems(newItems);
    await simpanInformasiSesiKeDB(pahlawanIds, newItems);

    setFormItem({ user_id: '1', nama_menu: '', catatan: '', qty: 1, tipe_pembagian: 'sendiri', penanggung_id: '', is_ppn_included: true, ppn_rate: 11 });
    setHargaInput('');
    setActiveTab('hasil');
  };

  const handleEditClick = (item: ItemPesanan) => {
    setEditingId(item.id);
    setHargaInput(item.harga === 0 ? '' : item.harga.toString());
    setFormItem({ user_id: item.user_id, nama_menu: item.nama_menu, catatan: item.catatan, qty: item.qty, tipe_pembagian: item.tipe_pembagian, penanggung_id: item.penanggung_id, is_ppn_included: item.is_ppn_included, ppn_rate: item.ppn_rate });
    setActiveTab('pemesanan');
  };

  const sortedItems = [...items].sort((a, b) => {
    if (a.sudah_diterima !== b.sudah_diterima) return a.sudah_diterima ? 1 : -1;
    return a.nama_menu.localeCompare(b.nama_menu);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-500 hover:bg-slate-100 p-2 rounded-lg text-sm font-medium">← Dashboard</Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              🥪 {namaSesi || 'Sesi Baru'} 
              {isSesiOpen && statusSesi === 'Open' && <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase">Berjalan</span>}
              {statusSesi === 'Closed' && <span className="bg-rose-100 text-rose-700 text-[10px] px-2 py-0.5 rounded-full uppercase">🔒 Ditutup</span>}
            </h1>
            <p className="text-xs text-slate-500">{warungTerpilih || 'Warung TBD'} • {tanggal}</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 mt-6">
        {isSesiOpen && (
          <div className="flex space-x-1 bg-slate-200/60 p-1 rounded-xl mb-6 overflow-x-auto">
            <button onClick={() => setActiveTab('pemesanan')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold capitalize whitespace-nowrap transition-all ${activeTab === 'pemesanan' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}>1. Pemesanan</button>
            <button onClick={() => setActiveTab('hasil')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold capitalize whitespace-nowrap transition-all ${activeTab === 'hasil' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}>2. Hasil & Checklist</button>
            <button onClick={() => setActiveTab('rekapan')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold capitalize whitespace-nowrap transition-all ${activeTab === 'rekapan' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}>3. Rekapan Tagihan</button>
          </div>
        )}

        {activeTab === 'pemesanan' && (
          <div className={`grid grid-cols-1 gap-6 ${isSesiOpen ? 'md:grid-cols-2' : 'max-w-xl mx-auto'}`}>
            <div className="bg-white p-6 rounded-2xl border shadow-sm h-fit">
              <h3 className="font-bold border-b pb-2 mb-4">Informasi Sesi Jajan</h3>
              <div className="space-y-4">
                <div><label className="text-xs font-semibold text-slate-500 uppercase">Nama Sesi</label><input type="text" placeholder="Contoh: Makan Siang Kantor" value={namaSesi} onChange={(e) => setNamaSesi(e.target.value)} disabled={isSesiOpen} className="w-full border-b py-1 font-medium disabled:opacity-70 focus:outline-none" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-semibold text-slate-500 uppercase">Tanggal</label><input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={isSesiOpen} className="w-full border-b py-1 disabled:opacity-70 text-sm" /></div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Warung / Resto</label>
                    <input list="daftar-warung" placeholder="Ketik warung..." value={warungTerpilih} onChange={(e) => setWarungTerpilih(e.target.value)} disabled={isSesiOpen} className="w-full border-b py-1 disabled:opacity-70 text-sm" />
                    <datalist id="daftar-warung">{daftarWarung.map(w => <option key={w} value={w} />)}</datalist>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">Pahlawan (Yang Nalangin)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {anggota.map(a => (
                      <label key={a.id} className={`flex items-center gap-2 p-2 rounded-lg border ${statusSesi === 'Open' ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${pahlawanIds.includes(a.id) ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                        <input disabled={statusSesi === 'Closed'} type="checkbox" checked={pahlawanIds.includes(a.id)} onChange={() => togglePahlawan(a.id)} className="w-4 h-4 text-amber-500 rounded" />
                        <span className={`text-sm ${pahlawanIds.includes(a.id) ? 'font-bold text-amber-700' : 'text-slate-600'}`}>{a.nama}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {!isSesiOpen && (
                  <button onClick={handleBukaSesi} disabled={!namaSesi || !warungTerpilih} className="w-full mt-4 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">Buka Sesi (Simpan) & Mulai Pesan</button>
                )}
              </div>
            </div>

            {isSesiOpen && statusSesi === 'Open' && (
              <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <h3 className="font-bold mb-4">{editingId ? 'Edit Pesanan' : 'Tambah Pesanan Baru'}</h3>
                <form onSubmit={handleSaveItem} className="space-y-4">
                  <div><label className="text-xs font-medium block mb-1">Siapa yang Makan?</label><select value={formItem.user_id} onChange={(e) => setFormItem({ ...formItem, user_id: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-slate-50 text-sm font-semibold">{anggota.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></div>
                  <div><label className="text-xs font-medium block mb-1">Nama Menu</label><input type="text" required value={formItem.nama_menu} onChange={(e) => setFormItem({ ...formItem, nama_menu: e.target.value })} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                  <div><label className="text-xs font-medium block mb-1 text-slate-500">Catatan Khusus</label><input type="text" placeholder="Opsional (Cth: Pedas)" value={formItem.catatan} onChange={(e) => setFormItem({ ...formItem, catatan: e.target.value })} className="w-full px-3 py-2 border bg-slate-50 rounded-xl text-sm italic" /></div>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="col-span-2">
                      <label className="text-xs font-medium block mb-1">Harga Satuan</label>
                      <div className="relative"><span className="absolute left-3 top-2 text-sm text-slate-400 font-medium">Rp</span><input type="text" placeholder="TBD" value={hargaInput === '0' || hargaInput === '' ? '' : Number(hargaInput).toLocaleString('id-ID')} onChange={handleHargaChange} className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm font-bold" /></div>
                    </div>
                    <div><label className="text-xs font-medium block mb-1">Qty</label><input type="number" step="any" min="0.1" required value={formItem.qty} onChange={(e) => setFormItem({ ...formItem, qty: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer mb-2"><input type="checkbox" checked={formItem.is_ppn_included} onChange={(e) => setFormItem({ ...formItem, is_ppn_included: e.target.checked })} className="w-4 h-4 text-amber-500 rounded" /><span className="text-sm font-medium text-slate-700">Harga sudah termasuk Pajak/PPN</span></label>
                    {!formItem.is_ppn_included && (<div className="pl-6 flex items-center gap-2"><span className="text-xs text-slate-500">Tambahkan PPN:</span><select value={formItem.ppn_rate} onChange={(e) => setFormItem({ ...formItem, ppn_rate: Number(e.target.value) })} className="px-2 py-1 text-sm border rounded bg-white"><option value={10}>10%</option><option value={11}>11%</option><option value={12}>12%</option></select></div>)}
                  </div>
                  <div><label className="text-xs font-medium block mb-1">Skema Bayar</label><select value={formItem.tipe_pembagian} onChange={(e) => setFormItem({ ...formItem, tipe_pembagian: e.target.value as TipePembagian })} className="w-full px-3 py-2 border rounded-xl text-sm"><option value="sendiri">Bayar Sendiri</option><option value="dibagi_rata">Bagi Rata Kelompok</option><option value="dibebankan">Ditraktir Orang Lain</option></select></div>
                  {formItem.tipe_pembagian === 'dibebankan' && (<div className="p-3 bg-amber-50 rounded-xl border border-amber-200"><label className="text-xs font-bold text-amber-800 block mb-1">Sponsornya Siapa?</label><select value={formItem.penanggung_id} required onChange={(e) => setFormItem({ ...formItem, penanggung_id: e.target.value })} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"><option value="">-- Pilih --</option>{anggota.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></div>)}
                  <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-sm">{editingId ? 'Simpan Perubahan' : 'Masukkan ke Keranjang'}</button>
                </form>
              </div>
            )}

            {statusSesi === 'Closed' && (
              <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 text-center h-fit">
                 <h3 className="font-bold text-rose-700 mb-2">🔒 Sesi Telah Ditutup</h3>
                 <p className="text-sm text-rose-600">Pesanan tidak dapat ditambah atau diubah lagi. Tagihan resmi sudah dikunci. Silakan cek menu Hasil atau Rekapan Tagihan.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hasil' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border shadow-sm">
              <div className="px-6 py-4 border-b bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-950">📋 List Pesanan (Belum Selesai di Atas)</h3></div>
              {sortedItems.length === 0 ? (<div className="p-12 text-center text-slate-500 text-sm">Keranjang masih kosong.</div>) : (
                <div className="divide-y divide-slate-100">
                  {sortedItems.map((item) => {
                    const user = anggota.find(a => a.id === item.user_id);
                    return (
                      <div key={item.id} className={`p-4 flex gap-4 items-center transition-colors ${item.sudah_diterima ? 'bg-slate-100/70 opacity-60' : 'hover:bg-slate-50'}`}>
                        <button disabled={statusSesi === 'Closed'} onClick={() => toggleDiterima(item.id)} className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${item.sudah_diterima ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400'} ${statusSesi === 'Closed' ? 'cursor-not-allowed opacity-70' : ''}`}>✓</button>
                        <div className="flex-1">
                          <div className={`font-bold ${item.sudah_diterima ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.nama_menu} <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded ml-1">x{item.qty}</span></div>
                          <div className="text-xs text-slate-500 mt-1"><span className="font-semibold text-slate-700">{user?.nama}</span>{item.catatan && <span className="italic ml-2">"{item.catatan}"</span>}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          {item.harga === 0 ? (<span className="text-xs font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded animate-pulse">Isi Harga!</span>) : (
                            <div className="font-bold text-slate-900 flex flex-col items-end">
                              <span>Rp {(item.harga * item.qty).toLocaleString('id-ID')}</span>
                              {!item.is_ppn_included && <span className="text-[9px] text-slate-400 font-normal uppercase">+ PPN {item.ppn_rate}%</span>}
                            </div>
                          )}
                          {(item.user_id === currentUser?.id || pahlawanIds.includes(currentUser?.id)) && statusSesi === 'Open' && (
                             <button onClick={() => handleEditClick(item)} className="text-[11px] underline text-amber-600 font-medium mt-1">Edit</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sticky top-24">
                <h3 className="font-bold text-amber-900 mb-4 uppercase text-sm">Summary</h3>
                <div className="space-y-3 mb-6 text-sm">
                  <div className="flex justify-between"><span className="text-amber-700">Total Item:</span><span className="font-bold text-amber-900">{items.reduce((sum, item) => sum + item.qty, 0)} Porsi</span></div>
                  <div className="flex justify-between"><span className="text-amber-700">Selesai/Datang:</span><span className="font-bold text-emerald-600">{items.filter(i => i.sudah_diterima).length} / {items.length}</span></div>
                </div>
                <div className="pt-4 border-t border-amber-200">
                  <div className="text-xs font-bold text-amber-700 uppercase mb-1">Total Uang Kasir</div>
                  <div className="text-3xl font-black text-amber-600">Rp {totalSesi.toLocaleString('id-ID')}</div>
                </div>
                <button onClick={() => setActiveTab('rekapan')} className="w-full mt-6 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-amber-600">Lihat Rekapan Tagihan →</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rekapan' && (
          <div className="space-y-6">
            {statusSesi === 'Open' && pahlawanIds.includes(currentUser?.id) && (
              <button
                onClick={handleTutupSesiDanTagih}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-lg flex justify-center items-center gap-2 mb-4 transition-all"
              >
                🔒 Kunci Sesi & Sebar Tagihan Resmi Ke Database
              </button>
            )}
            <div className="bg-amber-100 p-4 rounded-xl text-center"><div className="text-xs font-bold text-amber-800 uppercase">Total Sesi Kasir</div><div className="text-2xl font-black text-amber-600">Rp {totalSesi.toLocaleString('id-ID')}</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rekapanAkhir.filter(r => r.totalBeban > 0 || r.isPahlawan).map(r => (
                <div key={r.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.isPahlawan ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-200'}`}>
                  <div className={`px-5 py-3 border-b flex justify-between items-center ${r.isPahlawan ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <div className="font-bold text-lg">{r.nama} {r.isPahlawan && '👑'}</div>
                    <div className="text-right"><div className="text-[10px] font-bold text-slate-400 uppercase">Total Beban</div><div className="font-black text-slate-900">Rp {r.totalBeban.toLocaleString('id-ID')}</div></div>
                  </div>
                  <div className="p-5 text-sm space-y-3">
                    {r.struk.length === 0 ? <div className="text-slate-400 italic text-xs text-center">Tidak ada tagihan.</div> : r.struk.map((detail, idx) => (
                      <div key={idx} className="flex justify-between items-start border-b border-dashed border-slate-200 pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium text-slate-800">{detail.deskripsi}</div>
                          <div className={`text-[10px] font-bold uppercase mt-0.5 px-1.5 py-0.5 rounded inline-block ${detail.tipe === 'Bagi Rata' ? 'bg-blue-50 text-blue-600' : detail.tipe === 'Tanggungan' || detail.tipe === 'Tanggungan Bagi Rata' ? 'bg-purple-50 text-purple-600' : detail.tipe === 'Traktir' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{detail.tipe}</div>
                        </div>
                        <div className="font-semibold text-slate-700 whitespace-nowrap">Rp {detail.nominal.toLocaleString('id-ID')}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`px-5 py-3 border-t text-sm ${r.isPahlawan ? 'bg-amber-500 text-white' : 'bg-rose-50 text-rose-700'}`}>
                    {r.isPahlawan ? (
                      <div className="font-medium flex justify-between items-center"><span>Rekening Saya:</span><span className="font-bold text-xs bg-white/20 px-2 py-1 rounded">{r.nama_bank || 'Belum diisi'} - {r.no_rekening || ''}</span></div>
                    ) : (
                      <div className="font-bold flex flex-col gap-1">
                        <span className="text-xs uppercase text-rose-500">Transfer Ke Pahlawan:</span>
                        {pahlawanIds.length === 0 ? <div className="text-xs font-normal text-rose-600 italic">Belum ada pahlawan.</div> : pahlawanIds.map(pid => {
                          const p = anggota.find(a => a.id === pid);
                          return (
                            <div key={pid} className="flex justify-between items-center text-xs font-bold border-b border-rose-200/40 pb-1 last:border-0">
                              <span>🦸‍♂️ {p?.nama}</span>
                              <span className="bg-white/60 px-1.5 py-0.5 rounded text-slate-800 text-[10px]">{p?.nama_bank || 'Belum diisi'}: {p?.no_rekening || ''}</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between items-center mt-2 pt-1 border-t border-rose-300/40"><span>Total Bayar:</span><span className="text-base font-black">Rp {r.totalBeban.toLocaleString('id-ID')}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}