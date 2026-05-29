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

    // 3. LOGIKA PARSING RAW TEXT (Sama pintarnya seperti sebelumnya)
    const lines = rawText.split('\n');
    const parsedItems = [];
    const kataKunciAbaikan = ['total', 'grand', 'subtotal', 'kembali', 'cash', 'tunai', 'pajak', 'tax', 'diskon', 'discount', 'netto', 'change', 'amount'];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Regex mencari Teks diikuti dengan Harga (mendukung format dari OCR.Space yang dipisah dengan Tab/Spasi)
      const regexRupiah = /(.*?)\s+(?:(?:Rp|RP)?\.?\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,9})/i;
      const match = line.match(regexRupiah);

      if (match) {
        const namaItem = match[1].trim();
        const hargaStr = match[2].replace(/\D/g, ''); 
        const hargaNum = Number(hargaStr);

        const apakahKataKunciAbaikan = kataKunciAbaikan.some(kata => namaItem.toLowerCase().includes(kata));

        // Abaikan jika item kosong, harga tidak masuk akal, atau itu baris totalan
        if (namaItem && namaItem.length > 2 && hargaNum > 100 && !apakahKataKunciAbaikan) {
          parsedItems.push({
            id: 'ocr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
            item: namaItem,
            harga: hargaNum
          });
        }
      }
    }

    return NextResponse.json({ items: parsedItems });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}