'use client';
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

type AuthMode = 'login' | 'register' | 'forgot_password';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  
  // State Form
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [namaBank, setNamaBank] = useState('');
  const [noRekening, setNoRekening] = useState('');
  
  // State Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const formatPhoneNumber = (num: string) => {
    return num.startsWith('0') ? '+62' + num.substring(1) : num;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    const formattedPhone = formatPhoneNumber(phone);

    if (mode === 'login') {
      const { data: profile, error: searchError } = await supabase
        .from('profiles')
        .select('email')
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
        router.push('/dashboard');
      }

    } else if (mode === 'register') {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (authData?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            nama: username,
            email: email,
            no_hp: formattedPhone,
            nama_bank: namaBank,       
            no_rekening: noRekening
          });

        if (profileError) {
          setError('Gagal membuat profil: ' + profileError.message);
        } else {
          setSuccessMsg('Akun berhasil dibuat! Silakan masuk menggunakan Nomor HP Anda.');
          setMode('login');
          setPassword('');
        }
      }
      setLoading(false);

    } else if (mode === 'forgot_password') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/dashboard`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccessMsg('Link reset password telah dikirim ke email Anda. Silakan cek kotak masuk.');
      }
      setLoading(false);
    }
  };

  // ==========================================
  // FUNGSI PINTU BELAKANG (DEV BYPASS)
  // ==========================================
  const handleDevBypass = () => {
    const answer = window.prompt('Ise Goarmu?');
    if (answer === '123456') {
      router.push('/dashboard');
    } else if (answer !== null) {
      alert('Sandi salah, akses ditolak!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative">
      
      {/* TOMBOL RAHASIA (Dipojok kanan atas, disamarkan sedikit) */}
      <button 
        onClick={handleDevBypass}
        className="absolute top-4 right-4 px-3 py-1 bg-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
        title="Masuk Tanpa Login (Dev Mode)"
      >
        🤫 Dev Bypass
      </button>

      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-slate-950 tracking-tight">🥪 JajanBareng</h2>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'login' && 'Masuk dengan Nomor HP & Password.'}
            {mode === 'register' && 'Isi data berikut untuk bergabung.'}
            {mode === 'forgot_password' && 'Masukkan email untuk menerima tautan reset.'}
          </p>
        </div>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 text-center font-medium">{error}</div>}
        {successMsg && <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm border border-emerald-100 text-center font-medium">{successMsg}</div>}

        <form className="mt-8 space-y-4" onSubmit={handleAuth} suppressHydrationWarning>
          
          {mode !== 'forgot_password' && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Nomor WhatsApp / HP</label>
              <div className="flex">
                <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold">
                  +62
                </span>
                <input
                  type="tel"
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                  placeholder="81234567890"
                  value={phone.replace('+62', '')}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Nama User / Panggilan</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                placeholder="Contoh: budijajan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          {mode !== 'login' && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Alamat Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                placeholder="kamu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
          
          {mode !== 'forgot_password' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-slate-700">Password</label>
                {mode === 'login' && (
                  <button 
                    type="button" 
                    onClick={() => { setMode('forgot_password'); setError(''); setSuccessMsg(''); }}
                    className="text-xs text-amber-600 hover:underline font-medium"
                  >
                    Lupa Password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-900"
                placeholder={mode === 'register' ? 'Minimal 6 karakter' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {loading ? 'Memproses...' : (
              mode === 'login' ? 'Masuk ke Aplikasi' : 
              mode === 'register' ? 'Daftar Akun Jajan' : 'Kirim Link Reset'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 space-y-2">
          {mode === 'login' && (
            <p>
              Belum punya akun?{' '}
              <button type="button" onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }} className="font-bold text-amber-600 hover:underline">
                Daftar di sini
              </button>
            </p>
          )}
          {mode !== 'login' && (
            <p>
              <button type="button" onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }} className="font-bold text-slate-600 hover:underline">
                ← Kembali ke Halaman Masuk
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}