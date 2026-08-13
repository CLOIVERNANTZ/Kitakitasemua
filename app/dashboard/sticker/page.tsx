'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function StickerMakerPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputType, setOutputType] = useState<'GIF' | 'WebP' | null>(null);
  
  // New States
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  
  const [customText, setCustomText] = useState("");
  const [textSize, setTextSize] = useState<number>(48);
  const [textPosition, setTextPosition] = useState<'atas' | 'tengah' | 'bawah'>('bawah');
  
  const [bgMode, setBgMode] = useState<'transparan' | 'blur' | 'hitam' | 'putih'>('blur');
  
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerPosition, setStickerPosition] = useState<'tl' | 'tr' | 'bl' | 'br'>('tr');

  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => {
        if (messageRef.current) messageRef.current.innerHTML = message;
        console.log(message);
      });
      
      ffmpeg.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      // Load ffmpeg core
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      // Load Font for drawtext
      try {
        await ffmpeg.writeFile('Anton.ttf', await fetchFile('/fonts/Anton.ttf'));
      } catch (e) {
        console.error("Gagal load font", e);
      }
      
      setIsLoaded(true);
    };

    load().catch((err) => {
      console.error("Gagal load FFmpeg:", err);
      if (messageRef.current) messageRef.current.innerHTML = "Gagal memuat FFmpeg engine. Pastikan koneksi internet stabil.";
    });
  }, []);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setOutputUrl(null);
      setProgress(0);
      if (messageRef.current) messageRef.current.innerHTML = "Video dipilih. Siap dikonversi.";
    }
  };

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setStickerFile(file);
    }
  };

  const convertFile = async (type: 'GIF' | 'WebP') => {
    if (!videoFile || !isLoaded) return;
    
    setIsLoading(true);
    setProgress(0);
    setOutputType(type);
    
    try {
      const ffmpeg = ffmpegRef.current;
      
      // Write video file
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      
      // Write sticker file if exists
      if (stickerFile) {
        await ffmpeg.writeFile('sticker.png', await fetchFile(stickerFile));
      }
      
      // Determine inputs and trimming
      const inputArgs = [];
      if (startTime !== '') {
        inputArgs.push('-ss', startTime.toString());
      }
      if (endTime !== '') {
        inputArgs.push('-to', endTime.toString());
      }
      inputArgs.push('-i', 'input.mp4');
      
      if (stickerFile) {
        inputArgs.push('-i', 'sticker.png');
      }

      // Text position logic
      let textY = 'h-th-20'; // default bawah
      if (textPosition === 'atas') textY = '20';
      if (textPosition === 'tengah') textY = '(h-th)/2';

      // Safe text parsing for multi-line
      if (customText) {
        await ffmpeg.writeFile('text.txt', customText);
      }
      
      const drawTextFilter = customText 
        ? `drawtext=fontfile=Anton.ttf:textfile=text.txt:fontcolor=white:fontsize=${textSize}:x=(w-text_w)/2:y=${textY}:borderw=3:bordercolor=black` 
        : '';

      // Sticker position logic
      let overlayPos = 'W-w-10:10'; // default tr
      if (stickerPosition === 'tl') overlayPos = '10:10';
      if (stickerPosition === 'bl') overlayPos = '10:H-h-10';
      if (stickerPosition === 'br') overlayPos = 'W-w-10:H-h-10';

      let complexFilter = '';
      
      const buildBaseFilter = (size: number) => {
        if (bgMode === 'blur') {
          return `[0:v]fps=10,split[v0][v1];[v0]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},boxblur=20:5[bg];[v1]scale=${size}:${size}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[vbase];`;
        } else {
          const color = bgMode === 'hitam' ? 'black' : bgMode === 'putih' ? 'white' : 'white@0.0';
          return `[0:v]fps=10,scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=${color}[vbase];`;
        }
      };
      
      if (type === 'GIF') {
        let filterParts = buildBaseFilter(320);
        let lastOutput = '[vbase]';

        if (stickerFile) {
          filterParts += `[1:v]scale=80:-1[stk]; ${lastOutput}[stk]overlay=${overlayPos}[voverlay];`;
          lastOutput = '[voverlay]';
        }

        if (drawTextFilter) {
          filterParts += `${lastOutput}${drawTextFilter}[vtext];`;
          lastOutput = '[vtext]';
        }

        filterParts += `${lastOutput}split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[out]`;
        complexFilter = filterParts;

        await ffmpeg.exec([
          ...inputArgs,
          '-filter_complex', complexFilter,
          '-map', '[out]',
          '-loop', '0',
          'output.gif'
        ]);
        
        const data = await ffmpeg.readFile('output.gif') as Uint8Array;
        const url = URL.createObjectURL(new Blob([data as any], { type: 'image/gif' }));
        setOutputUrl(url);

      } else if (type === 'WebP') {
        let filterParts = buildBaseFilter(512);
        let lastOutput = '[vbase]';

        if (stickerFile) {
          filterParts += `[1:v]scale=150:-1[stk]; ${lastOutput}[stk]overlay=${overlayPos}[voverlay];`;
          lastOutput = '[voverlay]';
        }

        if (drawTextFilter) {
          filterParts += `${lastOutput}${drawTextFilter}[vtext];`;
          lastOutput = '[vtext]';
        }
        
        complexFilter = filterParts;
        if (complexFilter.endsWith(';')) {
           complexFilter += `${lastOutput}copy[out]`;
        } else {
           complexFilter = filterParts.replace(/;$/, '') + '[out]';
        }

        await ffmpeg.exec([
          ...inputArgs,
          '-vcodec', 'libwebp',
          '-filter_complex', complexFilter,
          '-map', '[out]',
          '-lossless', '0',
          '-compression_level', '6',
          '-q:v', '30',
          '-loop', '0',
          '-preset', 'picture',
          '-an',
          'output.webp'
        ]);

        const data = await ffmpeg.readFile('output.webp') as Uint8Array;
        const url = URL.createObjectURL(new Blob([data as any], { type: 'image/webp' }));
        setOutputUrl(url);
      }
    } catch (error) {
      console.error(error);
      if (messageRef.current) messageRef.current.innerHTML = "Terjadi kesalahan saat memproses video.";
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-black text-slate-900 mb-2">🎞️ Bikin Sticker & GIF Pro</h1>
        <p className="text-slate-600 mb-6">Potong video, tambah watermark sticker, dan kasih teks lucu untuk dikirim ke WhatsApp.</p>
        
        {!isLoaded ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 font-medium">
            <span className="animate-spin text-xl">⏳</span> Sedang memuat engine pembuat sticker... Harap tunggu sebentar.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors">
              <input 
                type="file" 
                accept="video/*" 
                onChange={handleVideoUpload}
                className="hidden" 
                id="video-upload"
              />
              <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-3">
                <span className="text-4xl">📥</span>
                <span className="font-bold text-slate-700">Pilih Video {videoFile ? `(${videoFile.name})` : '(Max 5 Detik)'}</span>
                <span className="text-sm text-slate-500">Klik untuk browse atau seret file ke sini</span>
              </label>
            </div>

            {videoFile && (
              <div className="grid lg:grid-cols-2 gap-8">
                {/* SETTINGS / EDITOR */}
                <div className="space-y-5 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <h3 className="font-black text-slate-800 text-lg border-b border-slate-200 pb-2">🛠️ Editor</h3>
                  
                  {/* TRIM VIDEO */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">✂️ Potong Video (Opsional)</label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <span className="text-xs text-slate-500 mb-1 block">Mulai (Detik)</span>
                        <input 
                          type="number" 
                          min="0"
                          step="0.1"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-amber-500 p-2.5"
                          placeholder="0"
                        />
                      </div>
                      <div className="flex-1">
                        <span className="text-xs text-slate-500 mb-1 block">Selesai (Detik)</span>
                        <input 
                          type="number" 
                          min="0"
                          step="0.1"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-amber-500 p-2.5"
                          placeholder="Bebas"
                        />
                      </div>
                    </div>
                  </div>

                  {/* LATAR BELAKANG */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">🎨 Latar Belakang (Untuk video vertikal)</label>
                    <div className="flex gap-2">
                      {(['blur', 'transparan', 'hitam', 'putih'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setBgMode(mode)}
                          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-colors capitalize ${bgMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* TEKS */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">✍️ Tambah Teks (Opsional)</label>
                    <textarea 
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Ketik sesuatu (Tekan Enter buat baris baru/wrap)..."
                      rows={2}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-amber-500 p-3 mb-2 resize-none"
                    />
                    
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold text-slate-500">Ukuran Teks:</span>
                      <input 
                        type="range" 
                        min="16" max="120" 
                        value={textSize}
                        onChange={(e) => setTextSize(Number(e.target.value))}
                        className="flex-1 accent-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-700 w-6">{textSize}</span>
                    </div>
                    <div className="flex gap-2">
                      {(['atas', 'tengah', 'bawah'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setTextPosition(pos)}
                          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-colors capitalize ${textPosition === pos ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* STICKER */}
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">🖼️ Tambah Logo/Sticker (Opsional)</label>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/webp" 
                      onChange={handleStickerUpload}
                      className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 mb-2 bg-white rounded-xl border border-slate-200 p-1"
                    />
                    {stickerFile && (
                      <div className="grid grid-cols-2 gap-2">
                        {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => {
                          const labels: Record<string, string> = { tl: 'Kiri Atas', tr: 'Kanan Atas', bl: 'Kiri Bawah', br: 'Kanan Bawah' };
                          return (
                            <button
                              key={pos}
                              onClick={() => setStickerPosition(pos)}
                              className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-colors ${stickerPosition === pos ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                            >
                              {labels[pos]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ACTIONS */}
                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                    <button 
                      onClick={() => convertFile('GIF')}
                      disabled={isLoading}
                      className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                    >
                      {isLoading && outputType === 'GIF' ? '⏳...' : '🪄 Buat GIF'}
                    </button>
                    <button 
                      onClick={() => convertFile('WebP')}
                      disabled={isLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                    >
                      {isLoading && outputType === 'WebP' ? '⏳...' : '🟢 Sticker WA'}
                    </button>
                  </div>
                </div>

                {/* HASIL / PROGRESS */}
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-800">Preview & Hasil:</h3>
                  <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center mb-4">
                    <video 
                      src={URL.createObjectURL(videoFile)} 
                      controls 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[250px] text-center">
                    {isLoading ? (
                      <div className="space-y-4 w-full">
                        <div className="text-4xl animate-bounce">🛠️</div>
                        <p className="font-bold text-slate-700">Lagi diproses {progress}%</p>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p ref={messageRef} className="text-xs text-slate-500 truncate px-4"></p>
                      </div>
                    ) : outputUrl ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <img 
                          src={outputUrl} 
                          alt="Hasil Konversi" 
                          className="max-h-[200px] max-w-[200px] object-contain drop-shadow-md rounded-lg"
                        />
                        <a 
                          href={outputUrl} 
                          download={`hasil-${outputType === 'WebP' ? 'sticker' : 'animasi'}.${outputType?.toLowerCase()}`}
                          className="bg-slate-900 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-slate-800 transition-colors inline-flex items-center gap-2 shadow-sm text-sm"
                        >
                          ⬇️ Download {outputType}
                        </a>
                      </div>
                    ) : (
                      <p className="text-slate-400 font-medium text-sm">Pilih video, atur pengaturan editor, lalu klik tombol konversi untuk melihat hasil.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
