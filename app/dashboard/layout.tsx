'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [profile, setProfile] = useState<{ id: string, nama: string, avatar_url: string | null } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // ✅ STATE BARU UNTUK SATPAM GERBANG
  const [isApproved, setIsApproved] = useState<boolean | null>(null); // null = masih ngecek
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let profileSubscription: any = null;

    const setupRealTimeProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsCheckingAuth(false);
        return;
      }
      setUserEmail(user.email ?? null);

      // ✅ Ambil juga is_approved dari database
      const { data: initialData } = await supabase
        .from('profiles')
        .select('id, nama, avatar_url, is_approved')
        .eq('id', user.id)
        .single();

      if (initialData) {
        setProfile({ id: initialData.id, nama: initialData.nama, avatar_url: initialData.avatar_url });
        setIsApproved(initialData.is_approved);
      }
      setIsCheckingAuth(false);

      // ✅ Realtime Listener (Pantau kalau God Admin ngasih ACC)
      profileSubscription = supabase
        .channel(`realtime-profile-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
          (payload) => {
            const newData = payload.new as any;
            setProfile({ id: newData.id, nama: newData.nama, avatar_url: newData.avatar_url });
            
            // Otomatis buka gerbang kalau tiba-tiba di-ACC
            if (newData.is_approved !== undefined) {
              setIsApproved(newData.is_approved);
            }
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
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        console.warn("🧹 Token kadaluarsa terdeteksi. Membersihkan...");
        await supabase.auth.signOut(); 
        router.push('/login'); 
      }
    };

    checkAndCleanSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, pathname]);

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

  // ⏳ TAMPILAN LOADING SEBELUM TAHU STATUSNYA APA
  if (isCheckingAuth) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-900 text-slate-400 font-bold animate-pulse">
        Menghubungi Markas Pusat...
      </div>
    );
  }

  // 🛑 TAMPILAN HALT JIKA BELUM DI ACC
  // Karena layout ini membungkus semuanya, sidebar dan header HP otomatis lenyap kalau belum di-ACC
  if (isApproved === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-slate-100">
        <div className="max-w-md w-full bg-white/10 p-8 rounded-3xl shadow-2xl text-center backdrop-blur-md border border-white/20">
          <span className="text-6xl mb-4 block animate-bounce">👮‍♂️</span>
          <h2 className="text-2xl font-black text-white mb-2">Halt! Siapa di sana?</h2>
          <p className="text-slate-300 font-medium mb-6">
            Akun kamu udah terdaftar, tapi gerbang masih digembok. Lapor ke "God Admin" dulu biar dibukain. <br/><br/>
            <span className="text-amber-400 text-xs italic">
              (Layar ini bakal otomatis ngebuka kok kalau kamu udah di-ACC, gak perlu di-refresh!)
            </span>
          </p>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-white/10 mb-6">
            <p className="text-sm font-bold text-slate-400 mb-1">Kirim pesan / WA ke:</p>
            <a href="mailto:germansiringo1234@gmail.com" className="text-amber-500 font-black text-lg hover:underline break-all">
              germansiringo1234@gmail.com
            </a>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full py-3 bg-rose-600/90 text-white font-bold rounded-xl hover:bg-rose-600 transition shadow-lg"
          >
            Keluar Dulu
          </button>
        </div>
      </div>
    );
  }

  // ✅ JIKA SUDAH DI ACC, RENDER SIDEBAR DAN KONTEN SEPERTI BIASA
  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative">

      {/* ✅ MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex justify-between items-center px-4 shadow-sm">
        <h1 className="text-lg font-black text-slate-950 tracking-tight">💰 KitaKitaSemua</h1>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 bg-slate-100 text-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      {/* ✅ BACKDROP GELAP UNTUK HP */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* ✅ SIDEBAR */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        
        <div>
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
            <h1 className="text-xl font-black text-slate-950 tracking-tight">KitaKitaSemua</h1>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-rose-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          {/* USER PROFILE MOVED TO TOP */}
          {profile && (
            <div className="px-4 py-4 border-b border-slate-100 bg-slate-50/30">
              <div className="flex items-center gap-3 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                <div
                  className="relative w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-200 flex items-center justify-center font-black text-blue-700 cursor-pointer overflow-hidden group flex-shrink-0 shadow-sm transition-all hover:border-blue-400"
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
                  <p className="text-xs font-bold text-slate-900 truncate">{profile.nama || 'User'}</p>
                  <p className="text-[9px] font-bold text-emerald-600 truncate uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span> Online
                  </p>
                </div>
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} />
              </div>
            </div>
          )}

          <nav className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
            
            {/* BERANDA */}
            <div>
              <p className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Beranda</p>
              <div className="space-y-0.5">
                <Link href="/dashboard" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  🏠 Beranda
                </Link>
              </div>
            </div>

            {/* ACARA */}
            <div>
              <p className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Acara</p>
              <div className="space-y-0.5">
                <Link href="/dashboard/jajan" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/jajan') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  🍔 Jajan
                </Link>
                <Link href="/dashboard/nginap" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/nginap') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  🏨 Nginap
                </Link>
                <Link href="/dashboard/lapak" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/lapak') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  📊 Project
                </Link>
              </div>
            </div>

            {/* TAGIHAN */}
            <div>
              <p className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tagihan</p>
              <div className="space-y-0.5">
                <Link href="/dashboard/riwayat" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/riwayat') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  📜 Riwayat Tagihan
                </Link>
                <Link href="/dashboard/histori" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/histori') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  📂 Histori Acara
                </Link>
              </div>
            </div>

            {/* KITAKITASEMUA */}
            <div>
              <p className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">KitaKitaSemua</p>
              <div className="space-y-0.5">
                <Link href="/dashboard/profile" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/profile') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  👤 Profil
                </Link>
                <Link href="/dashboard/gallery" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/gallery') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  📸 Galeri
                </Link>
                <Link href="/dashboard/bongak" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/bongak') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  🤪 Bongak
                </Link>
              </div>
            </div>

            {/* STICKER */}
            {userEmail === 'germansiringo1234@gmail.com' && (
              <div>
                <p className="px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Eksklusif</p>
                <div className="space-y-0.5">
                  <Link href="/dashboard/sticker" className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all ${isActive('/dashboard/sticker') ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                    🎞️ Sticker
                  </Link>
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* BOTTOM SECTION */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3 pb-safe">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl font-bold text-xs transition-all touch-manipulation">
            🚪 Keluar Aplikasi
          </button>
        </div>
      </div>

      {/* ✅ KONTEN UTAMA */}
      <main className="flex-1 h-full overflow-y-auto relative z-10 pt-16 md:pt-0 bg-slate-50 w-full">
        {children}
      </main>
    </div>
  );
}