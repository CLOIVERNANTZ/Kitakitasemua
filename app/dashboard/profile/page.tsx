'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

export default function ProfilePage() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userAuth, setUserAuth] = useState<any>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [profile, setProfile] = useState({
    nama: '', email: '', no_hp: '', nama_bank: '', no_rekening: '', avatar_url: ''
  });
  const [formData, setFormData] = useState({ ...profile });

  const daftarBank = ['BCA', 'Mandiri', 'BNI', 'BRI', 'BSI', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'Bank Jago', 'SeaBank'];

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      // 1. Dapatkan User Login
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login');
        return;
      }
      setUserAuth(user);

      // 2. Tarik data profil dengan error handling yang lebih baik
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(); // Menggunakan .maybeSingle() agar tidak error kalau data kosong

      // 3. Tentukan data final
      const finalData = profile
        ? { ...profile, email: user.email || '' }
        : {
          nama: user.email?.split('@')[0] || 'User',
          email: user.email || '',
          no_hp: '',
          nama_bank: '',
          no_rekening: ''
        };

      // 4. Update State
      setProfile(finalData);
      setFormData(finalData);
    } catch (err) {
      console.error("Gagal fetch profile:", err);
    } finally {
      setIsDataLoaded(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 3. Simpan permanen ke Supabase Database
    const { error } = await supabase.from('profiles').upsert({
      id: userAuth.id,
      nama: formData.nama,
      no_hp: formData.no_hp,
      nama_bank: formData.nama_bank,
      no_rekening: formData.no_rekening,
    });

    if (error) {
      alert('Gagal menyimpan data: ' + error.message);
    } else {
      setProfile(formData);
      setIsEditing(false);
      alert('Profil berhasil disimpan ke Database!');
    }
    setLoading(false);
  };

  if (!isDataLoaded) return <div className="p-12 text-center text-slate-500 font-bold animate-pulse">Menghubungkan ke Database...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto min-h-screen text-slate-900">
      <header className="mb-8 tracking-tight">
        <h2 className="text-3xl font-extrabold text-slate-950">Profil Saya 👤</h2>
        <p className="text-slate-500 mt-1">Kelola data diri dan informasi rekening untuk menerima uang jajan.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Kolom Kiri */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center shadow-sm sticky top-8">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Foto Profil"
                className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-white shadow-lg mb-4"
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full mx-auto flex items-center justify-center text-4xl text-white font-bold shadow-inner mb-4">
                {profile.nama ? profile.nama.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <h3 className="text-xl font-bold text-slate-900">{profile.nama}</h3>
            <p className="text-sm text-slate-500 mt-1">{profile.email}</p>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status Rekening</div>
              {profile.nama_bank && profile.no_rekening ? (
                <div className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-emerald-200">✅ Siap Menerima Dana</div>
              ) : (
                <div className="inline-block bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-sm font-bold border border-rose-200 animate-pulse">⚠️ Rekening Belum Diatur</div>
              )}
            </div>
          </div>
        </div>

        {/* Kolom Kanan */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg">Informasi Akun</h3>
              {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-sm bg-white border border-slate-300 text-slate-700 font-bold px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm">
                  Edit Profil
                </button>
              )}
            </div>

            <div className="p-8">
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-amber-700 uppercase tracking-wider border-b border-amber-100 pb-2">Data Pribadi</h4>
                  <div>
                    <label className="text-sm font-semibold text-slate-600 block mb-1.5">Nama Panggilan</label>
                    <input type="text" required disabled={!isEditing} value={formData.nama} onChange={(e) => setFormData({ ...formData, nama: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium disabled:bg-slate-50 disabled:text-slate-500 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-600 block mb-1.5">Nomor WhatsApp</label>
                      <input type="text" disabled={!isEditing} value={formData.no_hp} onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium disabled:bg-slate-50 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-600 block mb-1.5">Email</label>
                      <input type="email" disabled value={formData.email} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium bg-slate-100 text-slate-500 cursor-not-allowed outline-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <h4 className="text-sm font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-100 pb-2">Informasi Pencairan Dana</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-600 block mb-1.5">Nama Bank / E-Wallet</label>
                      <input list="bank-list" disabled={!isEditing} placeholder="Pilih atau ketik..." value={formData.nama_bank || ''} onChange={(e) => setFormData({ ...formData, nama_bank: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium disabled:bg-slate-50 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500" />
                      <datalist id="bank-list">{daftarBank.map(b => <option key={b} value={b} />)}</datalist>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-600 block mb-1.5">Nomor Rekening / HP</label>
                      <input type="text" disabled={!isEditing} placeholder="Contoh: 8012345678" value={formData.no_rekening || ''} onChange={(e) => setFormData({ ...formData, no_rekening: e.target.value.replace(/\D/g, '') })} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold tracking-wider disabled:bg-slate-50 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="pt-6 border-t border-slate-100 flex gap-3 justify-end">
                    <button type="button" onClick={() => { setIsEditing(false); setFormData(profile); }} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 text-sm">Batal</button>
                    <button type="submit" disabled={loading} className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm disabled:opacity-70 text-sm">{loading ? 'Menyimpan...' : '💾 Simpan ke Database'}</button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}