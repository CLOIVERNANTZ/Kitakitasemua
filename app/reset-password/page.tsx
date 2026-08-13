'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Supabase secara otomatis menangani token dari URL (hash fragments)
    // saat pengguna klik link dari email. Kita hanya perlu memanggil updateUser.
    // Jika tidak ada hash/token, pengguna mungkin mengakses halaman ini secara manual.
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // Jika tidak ada session (token invalid/expired atau tidak ada token di url)
        // Kita biarkan saja dulu, karena `supabase.auth.updateUser` akan menolaknya.
        // Tapi lebih baik beri pesan.
        // Tunggu sedikit barangkali auth state listener belum selesai.
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setError('Waduh, konfirmasi password tidak sama nih.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password minimal 6 karakter bwang.');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      setError('Gagal mengganti password: ' + updateError.message);
    } else {
      setSuccessMsg('Mantap! Password berhasil diganti. Langsung masuk aja.');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">
      
      {/* Background Sederhana */}
      <div
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1920)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(5px)',
        }}
      />

      <div className="max-w-md w-full space-y-8 bg-white/90 p-8 rounded-3xl shadow-2xl border border-white/20 relative z-10 backdrop-blur-md">
        <div className="text-center">
          <h2 className="text-3xl font-black text-slate-950 tracking-tight">Kunci Baru 🔑</h2>
          <p className="mt-2 text-sm text-slate-600 font-medium">
            Masukkan password barumu di bawah ini. Jangan sampai lupa lagi!
          </p>
        </div>

        {error && <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm border border-rose-100 text-center font-bold">{error}</div>}
        {successMsg && <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm border border-emerald-100 text-center font-bold">{successMsg}</div>}

        <form className="mt-8 space-y-4" onSubmit={handleReset}>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Password Baru</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Konfirmasi Password Baru</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900 text-sm"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!successMsg}
            className="w-full mt-6 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 text-sm"
          >
            {loading ? 'Menyimpan...' : 'Ganti Password 🚀'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 font-medium">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="font-black text-slate-700 hover:underline"
          >
            ← Kembali ke Pintu Depan
          </button>
        </div>
      </div>
    </div>
  );
}
