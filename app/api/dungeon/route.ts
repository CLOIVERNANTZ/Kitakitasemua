// app/api/dungeon/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    
    // 🔑 PIN Rahasia (Bisa diubah sesuai selera)
    const secretPin = process.env.ADMIN_SECRET_PIN || '437626';
    
    // 📧 UBAH dengan EMAIL akun aslimu yang sudah bisa login!
    const myRealEmail = process.env.ADMIN_LOGIN_EMAIL || 'germansiringo1234@gmail.com';
    
    // 🔐 UBAH dengan PASSWORD akun aslimu!
    const myRealPassword = process.env.ADMIN_LOGIN_PASSWORD || '437626';
    
    if (pin === secretPin) {
      // ✅ PIN BENAR: Server menyerahkan email & password aslimu ke Frontend
      return NextResponse.json({ 
        success: true, 
        email: myRealEmail, 
        password: myRealPassword 
      });
    } else {
      // ❌ PIN SALAH
      return NextResponse.json({ success: false, message: 'Invalid PIN' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}