/* ── TRENDYOL SATIŞ YÖNETİMİ · state.js ─────────────────────────
   Tüm veri okuma/yazma buradan geçer.
   Supabase'e geçişte sadece bu dosya değişir.
──────────────────────────────────────────────────────────────── */

const DB_KEYS = {
  urunler:    'tsx_urunler',
  satislar:   'tsx_satislar',
  ayarlar:    'tsx_ayarlar',
  kullanici:  'tsx_kullanici',
  ortak:      'tsx_ortak',
};

/* ── YARDIMCILAR ─────────────────────────────────────────────── */
const get  = k => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } };
const set  = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const today = () => new Date().toISOString().slice(0,10);

/* ── KULLANICI ───────────────────────────────────────────────── */
export const auth = {
  girisYap(email, sifre) {
    const k = get(DB_KEYS.kullanici);
    if (!k) return { hata: 'Hesap bulunamadı' };
    if (k.email !== email || k.sifre !== sifre) return { hata: 'E-posta veya şifre hatalı' };
    set('tsx_oturum', { ...k, giris: Date.now() });
    return { ok: true, kullanici: k };
  },
  kayitOl(email, sifre, ad, ortakKod = null) {
    if (get(DB_KEYS.kullanici)) return { hata: 'Bu cihazda zaten hesap var' };
    const k = { id: uid(), email, sifre, ad, rol: 'sahip', ortakKod: uid().slice(0,8).toUpperCase(), tarih: today() };
    set(DB_KEYS.kullanici, k);
    set('tsx_oturum', { ...k, giris: Date.now() });
    return { ok: true, kullanici: k };
  },
  ortakGiris(email, sifre, ortakKod) {
    const sahip = get(DB_KEYS.kullanici);
    if (!sahip) return { hata: 'Geçersiz ortak kodu' };
    if (sahip.ortakKod !== ortakKod) return { hata: 'Ortak kodu hatalı' };
    const ortaklar = get(DB_KEYS.ortak) || [];
    let ortak = ortaklar.find(o => o.email === email);
    if (!ortak) {
      if (sifre.length < 6) return { hata: 'Şifre en az 6 karakter olmalı' };
      ortak = { id: uid(), email, sifre, ad: email.split('@')[0], rol: 'ortak', tarih: today() };
      set(DB_KEYS.ortak, [...ortaklar, ortak]);
    } else if (ortak.sifre !== sifre) {
      return { hata: 'Şifre hatalı' };
    }
    set('tsx_oturum_ortak', { ...ortak, giris: Date.now() });
    return { ok: true, kullanici: ortak };
  },
  oturum() {
    const o = get('tsx_oturum') || get('tsx_oturum_ortak');
    if (!o) return null;
    if (Date.now() - o.giris > 30 * 24 * 60 * 60 * 1000) { this.cikis(); return null; }
    return o;
  },
  cikis() {
    localStorage.removeItem('tsx_oturum');
    localStorage.removeItem('tsx_oturum_ortak');
  },
};

/* ── ÜRÜNLER ─────────────────────────────────────────────────── */
export const urunlerDB = {
  hepsini() { return get(DB_KEYS.urunler) || []; },
  ekle(urun) {
    const liste = this.hepsini();
    const yeni = { id: uid(), ...urun, stok: urun.stok ?? 0, tarih: today() };
    set(DB_KEYS.urunler, [...liste, yeni]);
    return yeni;
  },
  guncelle(id, degisiklik) {
    const liste = this.hepsini().map(u => u.id === id ? { ...u, ...degisiklik } : u);
    set(DB_KEYS.urunler, liste);
  },
  sil(id) { set(DB_KEYS.urunler, this.hepsini().filter(u => u.id !== id)); },
  bul(id) { return this.hepsini().find(u => u.id === id); },
  topluGuncelle(liste) { set(DB_KEYS.urunler, liste); },
};

/* ── SATIŞ KAYITLARI ─────────────────────────────────────────── */
export const satislarDB = {
  hepsini() { return get(DB_KEYS.satislar) || []; },
  ekle(kayitlar) {
    // kayitlar = [{ urunId, adet, tarih? }]
    const mevcut = this.hepsini();
    const yeniler = kayitlar.map(k => ({
      id: uid(), urunId: k.urunId, adet: k.adet,
      tarih: k.tarih || today(), kayitTarih: Date.now()
    }));
    set(DB_KEYS.satislar, [...mevcut, ...yeniler]);
    // Stoktan düş
    yeniler.forEach(k => {
      const u = urunlerDB.bul(k.urunId);
      if (u) urunlerDB.guncelle(k.urunId, { stok: Math.max(0, (u.stok || 0) - k.adet) });
    });
    return yeniler;
  },
  guneBGore(tarih) { return this.hepsini().filter(s => s.tarih === tarih); },
  aralik(bas, bit) { return this.hepsini().filter(s => s.tarih >= bas && s.tarih <= bit); },
  sil(id) {
    const kayit = this.hepsini().find(s => s.id === id);
    if (kayit) {
      const u = urunlerDB.bul(kayit.urunId);
      if (u) urunlerDB.guncelle(kayit.urunId, { stok: (u.stok || 0) + kayit.adet });
      set(DB_KEYS.satislar, this.hepsini().filter(s => s.id !== id));
    }
  },
};

/* ── AYARLAR ─────────────────────────────────────────────────── */
export const ayarlarDB = {
  varsayilan: {
    kargoBaremEsik1: 150, kargoBaremUcret1: 51.492,
    kargoBaremEsik2: 300, kargoBaremUcret2: 88.488,
    platformAyniGun: 8.388, platformNormal: 13.188,
    komisyonTipi: 'Kadın Girişimci / Kadın Kooperatifler Özel Komisyon % (KDV Dahil)',
    hedefKarROI: 0.30,
    kargoFirma: 'Aras',
    ayniGunKargo: false,
  },
  oku() { return { ...this.varsayilan, ...(get(DB_KEYS.ayarlar) || {}) }; },
  kaydet(yeni) { set(DB_KEYS.ayarlar, { ...(get(DB_KEYS.ayarlar) || {}), ...yeni }); },
};

/* ── HESAPLAMA MOTORU ────────────────────────────────────────── */
export const hesapla = {
  // Kargo: self-consistent barem seçimi (döngüsüz)
  kargo(alisToplam, desi, kargoFirmaUcret, ayarlar) {
    const { kargoBaremEsik1: e1, kargoBaremUcret1: k1,
            kargoBaremEsik2: e2, kargoBaremUcret2: k2 } = ayarlar;
    if (desi > 10) return kargoFirmaUcret;
    const payda = (kom, hedef) => 1 - kom - hedef;
    // Placeholder — gerçek hesap fiyatHesapla içinde
    const satisAlt = (alisToplam + k1);
    const satisUst = (alisToplam + k2);
    if (satisAlt < e1) return k1;
    if (satisUst < e2) return k2;
    return kargoFirmaUcret;
  },

  // Satış fiyatı hesapla (self-consistent barem)
  satisFiyati(urun, ayarlar, adet = 1) {
    const { kargoBaremEsik1: e1, kargoBaremUcret1: k1,
            kargoBaremEsik2: e2, kargoBaremUcret2: k2,
            platformAyniGun, platformNormal, hedefKarROI } = ayarlar;

    const platform = ayarlar.ayniGunKargo ? platformAyniGun : platformNormal;
    const kom      = urun.komisyon || 0.04;
    const hedef    = urun.hedefKar || hedefKarROI;
    const desi     = urun.desi || 1;
    const alis     = (urun.alisFiyati || 0) * adet;
    const reklam   = urun.reklam || 0;
    const payda    = 1 - kom - hedef;
    const kargoFirmaUcret = urun.kargoFirmaUcret || 100.716;

    if (payda <= 0) return null;

    let kargo;
    if (desi > 10) {
      kargo = kargoFirmaUcret;
    } else {
      const satisAlt = (alis + platform + reklam + k1) / payda;
      const satisUst = (alis + platform + reklam + k2) / payda;
      if (satisAlt < e1)      kargo = k1;
      else if (satisUst < e2) kargo = k2;
      else                    kargo = kargoFirmaUcret;
    }

    const onerilen = (alis + platform + kargo + reklam) / payda;
    const yuvarlak = Math.ceil(onerilen) - 0.01;
    const basabas  = (alis + platform + kargo + reklam) / (1 - kom);
    const netKar   = yuvarlak - alis - platform - kargo - reklam - yuvarlak * kom;
    const roi      = alis > 0 ? netKar / alis : 0;

    return { onerilen, yuvarlak, basabas, kargo, platform, kom, netKar, roi };
  },

  // Max alış fiyatı (ROI bazlı)
  maxAlis(satisFiyati, komisyon, platform, kargo, roi, reklam = 0) {
    const pay = satisFiyati * (1 - komisyon) - platform - kargo - reklam;
    return pay / (1 + roi);
  },
};

/* ── DEMO VERİSİ ─────────────────────────────────────────────── */
export function demoYukle() {
  if (get(DB_KEYS.urunler)?.length) return; // zaten var
  const urunler = [
    { ad: "Dalin Bebe Sabunu Avokado (100 gr)", alisFiyati: 37, stok: 48, desi: 1, komisyon: 0.04, kategori: "Bebek Bakım ve Kozmetik, Bebek Sağlık Ürünleri, Diğer Bebek Bakım Ürünleri" },
    { ad: "Johnson's Baby Bebek Losyonu (300 ml)", alisFiyati: 141.9, stok: 24, desi: 1, komisyon: 0.04, kategori: "Bebek Kremi ve Yağı" },
    { ad: "Sudocrem Pişik Kremi (60 gr)", alisFiyati: 58.5, stok: 36, desi: 1, komisyon: 0.04, kategori: "Bebek Bakım ve Kozmetik, Bebek Sağlık Ürünleri, Diğer Bebek Bakım Ürünleri" },
    { ad: "Dalin Şampuan Normal (700 ml)", alisFiyati: 77.5, stok: 30, desi: 2, komisyon: 0.04, kategori: "Bebek Şampuanı" },
    { ad: "Bepanthol Baby Merhem (50 gr)", alisFiyati: 72.9, stok: 18, desi: 1, komisyon: 0.04, kategori: "Bebek Bakım ve Kozmetik, Bebek Sağlık Ürünleri, Diğer Bebek Bakım Ürünleri" },
    { ad: "Sebamed Bebek Güneş Spreyi (200 ml)", alisFiyati: 168.5, stok: 12, desi: 1, komisyon: 0.04, kategori: "Bebek Güneş Kremi" },
    { ad: "Dalin Islak Mendil 56'lı", alisFiyati: 28.9, stok: 60, desi: 1, komisyon: 0.028, kategori: "Bebek Islak Mendil / Havlu" },
    { ad: "Nivea Baby Pişik Kremi (100 ml)", alisFiyati: 49.9, stok: 22, desi: 1, komisyon: 0.04, kategori: "Bebek Bakım ve Kozmetik, Bebek Sağlık Ürünleri, Diğer Bebek Bakım Ürünleri" },
    { ad: "Uni Baby Kolay Tarama Şampuanı (700 ml)", alisFiyati: 89.5, stok: 15, desi: 2, komisyon: 0.04, kategori: "Bebek Şampuanı" },
    { ad: "Dalin Bebek Kolonyası Bıcı Bıcı (150 ml)", alisFiyati: 77.5, stok: 40, desi: 1, komisyon: 0.038, kategori: "Banyo & Duş Ürünleri, Kolonya, Ayak Bakımı, El & Tırnak Bakımı, Vücut Spreyi" },
  ];
  urunler.forEach(u => urunlerDB.ekle(u));
}

/* ── SYNC (Supabase geçince burası dolacak) ──────────────────── */
export const sync = {
  bagliMi: false,
  async baslat() { /* Supabase.js hazır olunca burayı dolduracağız */ },
  async uyarla() { /* realtime listener */ },
};

/* ── SUPABASE ENTEGRASYONU (otomatik) ────────────────────────── */
// supabase.js yüklenince sb objesi devreye girer
// urunlerDB ve satislarDB metodlarına sb çağrıları eklendi

import('./supabase.js').then(({ sb }) => {
  // Orijinal metodları wrap et — önce localStorage, sonra Supabase
  const _ekle      = urunlerDB.ekle.bind(urunlerDB);
  const _guncelle  = urunlerDB.guncelle.bind(urunlerDB);
  const _sil       = urunlerDB.sil.bind(urunlerDB);
  const _satisEkle = satislarDB.ekle.bind(satislarDB);
  const _satisSil  = satislarDB.sil.bind(satislarDB);

  urunlerDB.ekle = (urun) => {
    const yeni = _ekle(urun);
    sb.urunEkle(yeni);
    return yeni;
  };
  urunlerDB.guncelle = (id, degisiklik) => {
    _guncelle(id, degisiklik);
    sb.urunGuncelle(id, degisiklik);
  };
  urunlerDB.sil = (id) => {
    _sil(id);
    sb.urunSil(id);
  };
  satislarDB.ekle = (kayitlar) => {
    const yeniler = _satisEkle(kayitlar);
    sb.satisEkle(yeniler);
    return yeniler;
  };
  satislarDB.sil = (id) => {
    _satisSil(id);
    sb.satisSil(id);
  };
}).catch(() => {
  // Supabase yüklenemezse sadece localStorage ile devam et
  console.log('Offline mod aktif');
});
