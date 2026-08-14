// app/api/ocr/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64) {
      return NextResponse.json({ error: 'Gambar tidak ditemukan' }, { status: 400 });
    }

    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key OCR.Space belum diatur di .env.local' }, { status: 500 });
    }

    // 1. Siapkan data untuk dikirim ke OCR.Space
    const formData = new FormData();
    formData.append('base64Image', imageBase64);
    formData.append('language', 'eng'); // Bahasa Inggris/Global cukup untuk angka & huruf Latin
    formData.append('isOverlayRequired', 'false');
    formData.append('isTable', 'true'); // Sangat krusial agar baris struk sejajar!
    formData.append('scale', 'true');

    // 2. Tembak API OCR.Space
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': apiKey },
      body: formData
    });
    
    const data = await response.json();

    if (data.IsErroredOnProcessing) {
        return NextResponse.json({ error: data.ErrorMessage[0] }, { status: 500 });
    }

    const rawText = data.ParsedResults?.[0]?.ParsedText;

    if (!rawText) {
      return NextResponse.json({ items: [] });
    }

    // 3. Kembalikan semua baris mentah apa adanya
    const lines = rawText.split('\n');
    const rawLines = [];
    for (let line of lines) {
      if (line.trim()) {
        rawLines.push(line.trim());
      }
    }

    return NextResponse.json({ rawLines });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}