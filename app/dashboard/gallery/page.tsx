'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';

export default function FamilyGalleryPage() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State untuk Modal Upload
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetchUserAndPhotos();
  }, []);

  const fetchUserAndPhotos = async () => {
    setLoading(true);
    // Ambil data user yang sedang login
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    // Ambil foto beserta data profil peng-upload
    const { data, error } = await supabase
      .from('family_photos')
      .select(`
        id, 
        image_url, 
        caption, 
        created_at,
        user_id,
        profiles ( nama, avatar_url )
      `)
      .order('created_at', { ascending: false });

    if (!error && data) setPhotos(data);
    setLoading(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Math.random()}.${fileExt}`;
    const filePath = `kebersamaan/${fileName}`;

    try {
      // 1. Upload file ke Storage Supabase
      const { error: uploadError } = await supabase.storage
        .from('family_vault')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Dapatkan URL Publik gambar tersebut
      const { data: publicUrlData } = supabase.storage
        .from('family_vault')
        .getPublicUrl(filePath);

      // 3. Simpan data ke tabel family_photos
      const { error: dbError } = await supabase.from('family_photos').insert({
        user_id: user.id,
        image_url: publicUrlData.publicUrl,
        caption: caption
      });

      if (dbError) throw dbError;

      // Reset form & tutup modal
      setFile(null);
      setCaption('');
      setShowUploadMenu(false);
      fetchUserAndPhotos(); // Refresh galeri
    } catch (error: any) {
      alert('Gagal upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto min-h-screen bg-orange-50/30">
      
      {/* HEADER GALERI */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-amber-900">📸 Momen Keluarga</h1>
          <p className="text-amber-700/70 text-sm mt-1">Bagikan kebersamaan kita di sini.</p>
        </div>
        <button 
          onClick={() => setShowUploadMenu(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-full font-bold shadow-sm transition-transform active:scale-95 flex items-center gap-2"
        >
          <span>➕</span> Upload Foto
        </button>
      </div>

      {/* MODAL UPLOAD FOTO */}
      {showUploadMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl relative">
            <button onClick={() => setShowUploadMenu(false)} className="absolute top-4 right-5 text-slate-400 hover:text-rose-500 font-bold text-xl">✕</button>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Upload Momen Baru</h3>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="border-2 border-dashed border-amber-200 bg-amber-50 rounded-2xl p-6 text-center">
                <input 
                  type="file" 
                  accept="image/*" 
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-amber-200 file:text-amber-800 hover:file:bg-amber-300 cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Cerita di balik foto ini?</label>
                <textarea 
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Lagi makan bareng nih..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={uploading}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                {uploading ? 'Mengunggah...' : 'Bagikan Sekarang 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GRID FOTO / FEED */}
      {loading ? (
        <div className="text-center py-20 text-amber-700 font-bold animate-pulse">Memuat kenangan...</div>
      ) : photos.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-amber-100 shadow-sm">
          <span className="text-6xl mb-4 block">📭</span>
          <h3 className="text-xl font-bold text-slate-700">Belum ada foto</h3>
          <p className="text-slate-500 text-sm mt-2">Jadilah yang pertama membagikan momen!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {photos.map((photo) => (
            <div key={photo.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              {/* Gambar */}
              <div className="h-64 w-full bg-slate-100 relative group">
                <img 
                  src={photo.image_url} 
                  alt="Momen" 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Detail Profil & Caption */}
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs">
                    {photo.profiles?.nama?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{photo.profiles?.nama || 'Keluarga'}</p>
                    <p className="text-[10px] text-slate-400">{new Date(photo.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
                {photo.caption && (
                  <p className="text-sm text-slate-600 italic">"{photo.caption}"</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}