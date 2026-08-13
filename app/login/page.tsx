'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import DungeonPinPad from '@/components/DungeonPinPad';

type AuthMode = 'login' | 'register' | 'forgot_password';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const router = useRouter();

  // --- LOGIKA SLIDESHOW GERBANG KENANGAN ---
  const [backgroundPhotos, setBackgroundPhotos] = useState<string[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    // 1. Ambil foto-foto kebersamaan dari Supabase (Secara Publik)
    const fetchBackgrounds = async () => {
      const { data, error } = await supabase
        .from('family_photos')
        .select('image_url')
        .order('created_at', { ascending: false }) // Ambil yang terbaru dulu
        .limit(10); // Ambil 10 foto terakhir buat slideshow

      if (!error && data && data.length > 0) {
        // Ambil hanya URL-nya saja
        setBackgroundPhotos(data.map(p => p.image_url));
      } else {
        // Fallback jika tidak ada foto di database (bisa pakai warna solid atau image default)
        setBackgroundPhotos(['https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1920']);
      }
    };

    fetchBackgrounds();
  }, []);

  useEffect(() => {
    // 2. Logika Auto-Rotate (Slideshow) setiap 7 detik
    if (backgroundPhotos.length <= 1) return; // Jangan putar kalau cuma ada 1 foto

    const timer = setInterval(() => {
      setCurrentPhotoIndex((prevIndex) =>
        (prevIndex + 1) % backgroundPhotos.length
      );
    }, 7000); // Ganti foto setiap 7 detik

    return () => clearInterval(timer); // Bersihkan timer saat component unmount
  }, [backgroundPhotos]);
  // ------------------------------------------

  // State Form & Status (Sama seperti kemarin)
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDungeon, setShowDungeon] = useState(false);

  const formatPhoneNumber = (num: string) => {
    let clean = num.replace(/\D/g, ''); // Hapus semua karakter non-angka
    if (clean.startsWith('62')) clean = clean.substring(2);
    else if (clean.startsWith('0')) clean = clean.substring(1);
    return '+62' + clean;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    // 1. LOGIKA MODE: LOGIN
    if (mode === 'login') {
      const formattedPhone = formatPhoneNumber(phone);

      const { data: profile, error: searchError } = await supabase
        .from('profiles')
        .select('email, no_hp')
        .eq('no_hp', formattedPhone)
        .single();

      if (searchError || !profile) {
        setError('Nomor HP belum terdaftar di JajanBareng.');
        setLoading(false);
        return;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: password,
      });

      if (loginError) {
        setError('Password yang Anda masukkan salah.');
        setLoading(false);
      } else {
        router.push('/');
      }

      // 2. LOGIKA MODE: REGISTER
    } else if (mode === 'register') {
      const formattedPhone = formatPhoneNumber(phone);

      // Daftarkan Akun di Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (signUpError) {
        setError(
          JSON.stringify(signUpError) === '{}'
            ? 'Gagal mendaftar. Pastikan Confirm Email di Supabase sudah dimatikan.'
            : signUpError.message
        );
        setLoading(false);
        return;
      }

      if (authData?.user) {
        let finalAvatarUrl = '';

        // PROSES UPLOAD FOTO
        if (avatarFile) {
          const fileExt = avatarFile.name.split('.').pop();
          const fileName = `${authData.user.id}-${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, avatarFile);

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
            finalAvatarUrl = publicUrlData.publicUrl;
          }
        }

        // Simpan Profil ke Database beserta URL Fotonya
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            nama: username,
            email: email,
            no_hp: formattedPhone,
            avatar_url: finalAvatarUrl,
          });

        if (profileError) {
          setError('Akun berhasil dibuat, tapi gagal menyimpan profil: ' + profileError.message);
        } else {
          setSuccessMsg('Berhasil daftar! Tapi akunmu belum aktif. Silakan lapor ke bang RINGO, biar di ACC');
          setMode('login');
          setPassword('');
          setAvatarFile(null);
        }
      }
      setLoading(false);

      // 3. LOGIKA MODE: LUPA PASSWORD (Hanya Butuh Email)
    } else if (mode === 'forgot_password') {
      if (!email) {
        setError('Masukkan alamat email resmi Anda dulu bwang.');
        setLoading(false);
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError('Gagal mengirim email reset: ' + resetError.message);
      } else {
        setSuccessMsg('Mantap! Link reset password udah dikirim ke emailmu. Cek inbox/spam ya!');
        setMode('login');
      }
      setLoading(false);
    }
  };

  return (
    // CONTAINER UTAMA - Sekarang relatif agar background bisa absolute
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">

      {/* 🖼️ LAYER BACKGROUND SLIDESHOW (Auto-Generate & Auto-Rotate) */}
      {backgroundPhotos.map((photoUrl, index) => (
        <div
          key={photoUrl}
          className={`absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out ${index === currentPhotoIndex ? 'opacity-30' : 'opacity-0'
            }`}
          style={{
            backgroundImage: `url(${photoUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(3px)', // Beri sedikit efek blur biar form tetap fokus
          }}
        />
      ))}

      {/* 👑 RENDER DUNGEON PIN PAD (Mantra Rahasia) */}
      {showDungeon && <DungeonPinPad onClose={() => setShowDungeon(false)} />}

      {/* 🤫 TOMBOL DEV BYPASS (Tetap ada di pojok) */}
      <button
        type="button"
        onClick={() => setShowDungeon(true)}
        className="absolute top-4 right-4 px-3 py-1 bg-white/10 text-slate-300 text-xs font-bold rounded-lg hover:bg-white/20 transition-colors z-20 backdrop-blur-sm border border-white/10"
        title="Masuk markas tanpa ngetik (Dev Mode)"
      >
        🤫 Hack Kalau Bisa!
      </button>

      {/* BOX FORM LOGIN - Sekarang relatif z-10 agar di atas background */}
      <div className="max-w-md w-full space-y-8 bg-white/90 p-8 rounded-3xl shadow-2xl border border-white/20 relative z-10 backdrop-blur-md">

        <div className="text-center">
          <h2 className="text-3xl font-black text-slate-950 tracking-tight">🥪 JajanBareng</h2>
          <p className="mt-2 text-sm text-slate-600 font-medium">
            {mode === 'login' && 'Markas Kita Kita Semua. Masuk dulu Kuy!'}
            {mode === 'register' && 'Wajib isi data biar gak jadi buronan patungan.'}
          </p>
        </div>

        {error && <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm border border-rose-100 text-center font-bold">{error}</div>}
        {successMsg && <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm border border-emerald-100 text-center font-bold">{successMsg}</div>}

        <form className="mt-8 space-y-4" onSubmit={handleAuth} suppressHydrationWarning>

          {/* AREA UPLOAD FOTO PROFIL (Hanya Muncul saat Register - Padding Besar) */}
          {mode === 'register' && (
            <div className="p-5 sm:p-6 border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50 text-center mb-6 shadow-inner">
              <span className="text-3xl mb-2 block">📷</span>
              <label className="text-xs font-black text-amber-900 block mb-1">Pasang Komuk Terganteng/Tercantik</label>
              <p className="text-[10px] text-amber-700 mb-3">Format JPG/PNG, maksimal 2MB ya bwang.</p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} // 👈 TANGKAP FILE-NYA
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200 transition-colors cursor-pointer"
              />
            </div>
          )}

          {/* Form Inputs (No HP, Username, Email, Password) - Sama seperti kemarin */}
          {mode !== 'forgot_password' && (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Nomor WhatsApp / HP</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 text-slate-500 text-sm font-black">
                  +62
                </span>
                <input
                  type="tel"
                  required={mode === 'login' || mode === 'register'} // 👈 Menggunakan kondisi positif yang aman dari error linting
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
                  placeholder="81234567890"
                  value={phone.replace(/\D/g, '').replace(/^(62|0)/, '')}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Nama Panggilan di Tongkrongan</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
                placeholder="Contoh: Budi Buronan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          {/* AREA INPUT EMAIL (Muncul saat Register ATAU Lupa Password) */}
          {(mode === 'register' || mode === 'forgot_password') && (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Alamat Email Resmi</label>
              <input
                type="email"
                required={mode === 'register' || mode === 'forgot_password'}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
                placeholder="kamu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          {/* AREA INPUT PASSWORD (Hanya muncul jika BUKAN forgot_password) */}
          {mode !== 'forgot_password' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-600">Password</label>
              </div>
              <input
                type="password"
                required={mode === 'login' || mode === 'register'}
                minLength={6}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 text-sm"
          >
            {loading ? 'Sabar, lagi manggil Supabase...' : (
              mode === 'login' ? 'Masuk Markas 🚀' :
                mode === 'register' ? 'Daftar Jadi Personil 🔥' : 'Kirim Link Reset'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 space-y-3 font-medium">
          {/* TAMPILAN SAAT MODE LOGIN */}
          {mode === 'login' && (
            <>
              <p>
                Belum terdaftar di sirkel?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                  className="font-black text-amber-600 hover:underline"
                >
                  Gabung di sini bwang
                </button>
              </p>
              <p>
                <button
                  type="button"
                  onClick={() => { setMode('forgot_password'); setError(''); setSuccessMsg(''); }}
                  className="font-bold text-rose-500 hover:underline"
                >
                  Lupa Password? Waduh...
                </button>
              </p>
            </>
          )}

          {/* TAMPILAN SAAT MODE REGISTER */}
          {mode === 'register' && (
            <p>
              Sudah punya akun?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                className="font-black text-slate-700 hover:underline"
              >
                ← Kembali ke Pintu Depan
              </button>
            </p>
          )}

          {/* TAMPILAN SAAT MODE FORGOT PASSWORD */}
          {mode === 'forgot_password' && (
            <p>
              Ingat password-nya?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                className="font-black text-amber-600 hover:underline"
              >
                Coba Login Lagi bwang
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}