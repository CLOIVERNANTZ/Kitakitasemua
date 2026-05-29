'use client';
import { useState } from 'react';
import { supabase } from '@/utils/supabase';

interface DungeonPinPadProps {
  onClose: () => void;
}

export default function DungeonPinPad({ onClose }: DungeonPinPadProps) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [resetTaps, setResetTaps] = useState(0);
  const [statusMsg, setStatusMsg] = useState('ENTER THE FORBIDDEN RUNES');

  const handlePadClick = async (num: number) => {
    if (isLocked) {
      const newTaps = resetTaps + 1;
      setResetTaps(newTaps);
      setStatusMsg(`DUNGEON LOCKED. TAP ${7 - newTaps} TIMES TO BREAK CURSE.`);
      
      if (newTaps >= 7) {
        setIsLocked(false);
        setAttempts(0);
        setPin('');
        setResetTaps(0);
        setStatusMsg('MANA RESTORED. ENTER RUNES.');
      }
      return;
    }

    const newPin = pin + num;
    setPin(newPin);

    if (newPin.length === 6) {
      setStatusMsg('CASTING SPELL...');
      
      try {
        // 1. Validasi PIN ke Server API
        const res = await fetch('/api/dungeon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: newPin })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatusMsg('ACCESS GRANTED. SUMMONING...');
          
          // 🐛 DEBUG 1: Cek apakah API benar-benar mengirim email & password
          console.log("🕵️‍♂️ [DEBUG] Email dari API:", data.email);
          console.log("🕵️‍♂️ [DEBUG] Password dari API:", data.password ? "(Ada Password)" : "(KOSONG!)");

          // 2. Eksekusi Login
          await supabase.auth.signOut();
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password
          });

          if (signInError) {
            // 🐛 DEBUG 2: Tangkap pesan penolakan ASLI dari Supabase!
            console.error("🚨 [ERROR SUPABASE]:", signInError.message);
            setStatusMsg('SUMMON FAILED. CHECK CONSOLE!');
          } else {
            setStatusMsg('ALL HAIL THE ADMIN 👑');
            setTimeout(() => { window.location.href = '/dashboard/riwayat'; }, 1500);
          }
        } else {
          throw new Error(data.message || 'Wrong PIN');
        }
      } catch (err: any) {
        // 🐛 DEBUG 3: Tangkap error jaringan atau API gagal
        console.error("🚨 [ERROR SYSTEM]:", err.message);
        
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        
        if (newAttempts >= 3) {
          setIsLocked(true);
          setStatusMsg('CURSED! SYSTEM OVERLOAD.');
        } else {
          setStatusMsg(`WRONG RUNES! ${3 - newAttempts} ATTEMPTS LEFT.`);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/95 backdrop-blur-md font-mono select-none p-4">
      <div className="p-8 max-w-xs w-full bg-zinc-900 border-4 border-amber-900 rounded-3xl shadow-[0_0_30px_rgba(146,64,14,0.3)] relative overflow-hidden">
        
        {/* Ornamen Sudut */}
        <div className="absolute top-0 left-0 w-3 h-3 bg-amber-900 rounded-br"></div>
        <div className="absolute top-0 right-0 w-3 h-3 bg-amber-900 rounded-bl"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 bg-amber-900 rounded-tr"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-amber-900 rounded-tl"></div>

        {/* Layar Status */}
        <div className="text-center mb-8 min-h-[70px] flex flex-col justify-center border-b-2 border-zinc-800 pb-4">
          <div className={`text-xs tracking-wider font-bold uppercase transition-colors ${isLocked ? 'text-rose-500 animate-pulse' : 'text-amber-500'}`}>
            [ {statusMsg} ]
          </div>
          {!isLocked && (
            <div className="text-xl tracking-[0.6em] mt-3 font-black text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)] h-6">
              {pin.replace(/./g, '⚡')}
            </div>
          )}
        </div>

        {/* Grid Angka */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button key={num} type="button" onClick={() => handlePadClick(num)} className="h-14 rounded-xl border-2 border-amber-950 bg-zinc-800 text-zinc-400 text-xl font-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.05)] hover:bg-amber-900 hover:text-amber-100 hover:border-amber-500 active:scale-95 flex items-center justify-center transition-all">
              {num}
            </button>
          ))}
          <div className="col-start-2">
            <button type="button" onClick={() => handlePadClick(0)} className="w-full h-14 rounded-xl border-2 border-amber-950 bg-zinc-800 text-zinc-400 text-xl font-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.05)] hover:bg-amber-900 hover:text-amber-100 hover:border-amber-500 active:scale-95 flex items-center justify-center transition-all">
              0
            </button>
          </div>
        </div>

        <button type="button" onClick={onClose} className="mt-8 w-full text-[10px] text-zinc-600 uppercase tracking-widest hover:text-rose-500 transition-colors block text-center">
          ✖ [ Flee Dungeon ]
        </button>
      </div>
    </div>
  );
}