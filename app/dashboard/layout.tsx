'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // State untuk Profil & Upload
  const [profile, setProfile] = useState<{ id: string, nama: string, avatar_url: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // FITUR UTAMA: ENGINE REAL-TIME SUPABASE (SINKRONISASI FOTO)
  // ==========================================
  useEffect(() => {
    let profileSubscription: any = null;

    const setupRealTimeProfile = async () => {
      // 1. Dapatkan User Asli (Siapa saya?)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 2. Ambil Data Profil Pertama Kali (Tampilan Awal)
      const { data: initialData } = await supabase.from('profiles').select('id, nama, avatar_url').eq('id', user.id).single();
      if (initialData) setProfile(initialData);

      // 3. MULAI BERLANGGANAN DATA REAL-TIME (SINKRONISASI TANPA RELOAD)
      // Kode ini "mendengarkan" tabel 'profiles' khusus untuk ID saya.
      profileSubscription = supabase
        .channel(`realtime-profile-${user.id}`) // Saluran unik untuk user ini
        .on(
          'postgres_changes',
          {
            event: 'UPDATE', // Hanya dengarkan saat datanya Di-Update
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}` // Spesifik dengerin data SAYA saja
          },
          (payload) => {
            // BEGITU DATA BERUBAH DI SUPABASE (DI Halaman Manapun), JALANKAN INI!
            const newData = payload.new as any;
            // Update state UI Sidebar seketika, Tanpa Nge-refresh Halaman!
            setProfile({
              id: newData.id,
              nama: newData.nama,
              avatar_url: newData.avatar_url
            });
          }
        )
        .subscribe();
    };

    setupRealTimeProfile();

    // Cleanup Function: Matikan langganan kalau user logout/pindah halaman
    return () => {
      if (profileSubscription) supabase.removeChannel(profileSubscription);
    };
  }, []); // Hanya jalankan 1x saat aplikasi pertama kali dimuat

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (path: string) => pathname === path;

  // Engine Upload Foto Real-Time dari Sidebar (Sekarang Tanpa Reload)
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `avatar-${profile.id}-${Date.now()}.${fileExt}`;

    // Upload ke Supabase Storage (Bucket: avatars)
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

    if (uploadError) {
      alert('Gagal upload foto!');
      setIsUploading(false);
      return;
    }

    // Ambil URL Publiknya
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);

    // UPDATE DATABASE (Ini akan memicu Real-Time di atas!)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);

    // KITA TIDAK PERLU SET_PROFILE DI SINI LAGI! 
    // Karena sistem Real-Time di atas akan melakukannya untuk kita.
    setIsUploading(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">

      {/* Sidebar Kiri */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 z-20">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-slate-100">
            <h1 className="text-xl font-black text-slate-950 tracking-tight">💰 KitaKitaSemua</h1>
          </div>
          <nav className="p-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)]">

            <Link href="/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              🏠 Beranda
            </Link>

            <Link href="/dashboard/jajan" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/jajan') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              🍔 Jajan Kuy
            </Link>

            <Link href="/dashboard/nginap" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/nginap') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              🏨 Nginap Kuy
            </Link>

            <Link href="/dashboard/lapak" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/lapak') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              📊 Project Kita Kuy
            </Link>

            <Link href="/dashboard/riwayat" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/riwayat') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              📜 Riwayat Tagihan
            </Link>

            <Link href="/dashboard/histori" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/histori') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              📂 Histori Acara
            </Link>

            <Link href="/dashboard/profile" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/profile') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              👤 Profil Saya
            </Link>

          </nav>
        </div>

        {/* BOTTOM SECTION */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">

          {profile && (
            <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all">
              {/* Avatar yang bisa diklik */}
              <div
                className="relative w-11 h-11 rounded-full bg-blue-100 border-2 border-blue-200 flex items-center justify-center font-black text-blue-700 cursor-pointer overflow-hidden group flex-shrink-0 shadow-sm transition-all hover:border-blue-400"
                onClick={() => fileInputRef.current?.click()}
                title="Klik untuk ganti foto profil"
              >
                {isUploading ? (
                  <span className="text-[10px] animate-pulse">⏳</span>
                ) : profile.avatar_url ? (
                  // FOTO INI SEKARANG AKAN TERUPDATE OTOMATIS BERKAT REAL-TIME!
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  // Render huruf awal nama jika foto kosong (dengan safe navigation ?)
                  (profile.nama || 'U').charAt(0).toUpperCase()
                )}

                <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs">📷</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{profile.nama || 'User'}</p>
                <p className="text-[10px] font-bold text-emerald-600 truncate uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span> Online
                </p>
              </div>

              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} />
            </div>
          )}

          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-3 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl font-bold text-sm transition-all">
            🚪 Keluar Aplikasi
          </button>
        </div>
      </div>

      {/* Konten Utama */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {children}
      </main>
    </div>
  );
}