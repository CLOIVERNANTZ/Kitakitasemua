'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase'; // ✅ Memakai file utils/supabase

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [profile, setProfile] = useState<{ id: string, nama: string, avatar_url: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // ✅ STATE BARU UNTUK MENU HP
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let profileSubscription: any = null;

    const setupRealTimeProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: initialData } = await supabase.from('profiles').select('id, nama, avatar_url').eq('id', user.id).single();
      if (initialData) setProfile(initialData);

      profileSubscription = supabase
        .channel(`realtime-profile-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
          (payload) => {
            const newData = payload.new as any;
            setProfile({ id: newData.id, nama: newData.nama, avatar_url: newData.avatar_url });
          }
        ).subscribe();
    };

    setupRealTimeProfile();

    return () => {
      if (profileSubscription) supabase.removeChannel(profileSubscription);
    };
  }, []);


  // 🧹 SAPU OTOMATIS: Penjaga Sesi & Token Nyangkut
  useEffect(() => {
    const checkAndCleanSession = async () => {
      // 1. Cek status sesi saat ini
      const { data, error } = await supabase.auth.getSession();

      // 2. Jika ada error token nyangkut atau sesi tidak valid
      if (error || !data.session) {
        console.warn("🧹 Token kadaluarsa terdeteksi. Membersihkan...");
        await supabase.auth.signOut(); 
        router.push('/login'); 
      }
    };

    checkAndCleanSession();

    // 3. Pasang "CCTV" untuk memantau perubahan status (Cukup SIGNED_OUT saja)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, pathname]);

  // ✅ Tutup menu HP otomatis setiap kali pindah halaman
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (path: string) => pathname === path;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `avatar-${profile.id}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

    if (uploadError) {
      alert('Gagal upload foto!');
      setIsUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
    setIsUploading(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative">

      {/* ✅ MOBILE HEADER (HANYA MUNCUL DI HP) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex justify-between items-center px-4 shadow-sm">
        <h1 className="text-lg font-black text-slate-950 tracking-tight">💰 KitaKitaSemua</h1>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 bg-slate-100 text-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {/* Ikon Hamburger */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      {/* ✅ BACKDROP GELAP UNTUK HP (Muncul saat menu terbuka) */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* ✅ SIDEBAR (RESPONSIVE: Slide-in di HP, Statis di Laptop) */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        
        <div>
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
            <h1 className="text-xl font-black text-slate-950 tracking-tight">KitaKitaSemua</h1>
            {/* Tombol Close (X) hanya untuk HP */}
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-rose-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <nav className="p-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)] custom-scrollbar">
            
            <Link href="/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              🏠 Beranda
            </Link>
            <Link href="/dashboard/profile" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/profile') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              👤 Profil Saya
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
            
            <Link href="/dashboard/gallery" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/gallery') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              📸 Galeri KitaKitaSemua
            </Link>
            <Link href="/dashboard/bongak" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${isActive('/dashboard/bongak') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              🤪 BONGAK
            </Link>
          </nav>
        </div>

        {/* BOTTOM SECTION */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3 pb-safe">
          {profile && (
            <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all">
              <div
                className="relative w-11 h-11 rounded-full bg-blue-100 border-2 border-blue-200 flex items-center justify-center font-black text-blue-700 cursor-pointer overflow-hidden group flex-shrink-0 shadow-sm transition-all hover:border-blue-400"
                onClick={() => fileInputRef.current?.click()}
                title="Klik untuk ganti foto profil"
              >
                {isUploading ? (
                  <span className="text-[10px] animate-pulse">⏳</span>
                ) : profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
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

          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-3 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl font-bold text-sm transition-all touch-manipulation">
            🚪 Keluar Aplikasi
          </button>
        </div>
      </div>

      {/* ✅ KONTEN UTAMA (Dengan padding atas ekstra di HP agar tidak tertutup header) */}
      <main className="flex-1 h-full overflow-y-auto relative z-10 pt-16 md:pt-0 bg-slate-50 w-full">
        {children}
      </main>
    </div>
  );
}