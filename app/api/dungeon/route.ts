// app/api/dungeon/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    const cleanPin = pin.trim();
    
    // Memanggil rahasia dari brankas .env.local
    const vipUsers: Record<string, { email: string, password: string }> = {
      [process.env.VIP_PIN_1 as string]: { 
        email: process.env.VIP_EMAIL_1 as string, 
        password: process.env.VIP_PASS_1 as string 
      },
      [process.env.VIP_PIN_2 as string]: { 
        email: process.env.VIP_EMAIL_2 as string, 
        password: process.env.VIP_PASS_2 as string 
      }
    };

    const user = vipUsers[cleanPin];
    
    if (user && user.email && user.password) {
      return NextResponse.json({ success: true, email: user.email, password: user.password });
    } else {
      return NextResponse.json({ success: false, message: 'Invalid PIN' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}