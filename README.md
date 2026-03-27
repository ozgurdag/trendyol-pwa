# Satış Yönetim PWA

Trendyol satıcıları için mobil-first PWA uygulama.

## Özellikler

- 📊 **Dashboard** — Günlük satış özeti, stok uyarıları
- 💰 **Fiyat Hesapla** — 100+ ürün için otomatik satış fiyatı (kargo barem dahil)
- 🛒 **Satış Girişi** — Günlük satış kaydı, stok otomatik düşüm, toplu giriş
- 📦 **Stok Takibi** — Kritik stok uyarıları, Excel export
- 🎯 **Max Alış** — Hedef satış fiyatından maksimum alış hesabı
- ⚙️ **Ayarlar** — Ortak bağlantısı, Supabase senkronizasyonu, yedek/geri yükleme

## Kurulum

### 1. GitHub Pages (Ücretsiz)

```bash
git init
git add .
git commit -m "İlk commit"
git branch -M main
git remote add origin https://github.com/KULLANICI/satis-yonetim.git
git push -u origin main
```

GitHub → Settings → Pages → Source: main branch

URL: `https://kullanici.github.io/satis-yonetim`

### 2. Telefona Yükleme (PWA)

**Android:**
1. Chrome'da uygulamayı açın
2. ⋮ menü → "Ana ekrana ekle"
3. Uygulama gibi çalışır

**iPhone:**
1. Safari'de açın
2. Paylaş → "Ana Ekrana Ekle"
3. Uygulama simgesi oluşur

### 3. Supabase Bağlantısı (Gerçek Zamanlı Senkronizasyon)

1. [supabase.com](https://supabase.com) → New Project
2. Bölge: EU West (Frankfurt)
3. Settings → API → URL ve anon key kopyala
4. Uygulamada Ayarlar → Supabase bölümüne gir

## Dosya Yapısı

```
trendyol-pwa/
├── index.html          → Giriş / Kayıt
├── manifest.json       → PWA tanımı
├── sw.js               → Service Worker (offline)
├── css/
│   └── app.css         → Tüm stiller
├── js/
│   └── state.js        → Veri katmanı (localStorage → Supabase)
└── pages/
    ├── dashboard.html  → Ana panel
    ├── fiyatlar.html   → Fiyat hesaplama
    ├── satis-giris.html→ Satış girişi
    ├── stok.html       → Stok yönetimi
    ├── alis-hesap.html → Max alış hesabı
    └── ayarlar.html    → Ayarlar
```

## Kargo Barem Formülü

Self-consistent seçim (döngüsel referans yok):

```
Satış_AltBarem = (maliyet + 51.49₺) / (1 - komisyon - hedef_kar)
Satış_ÜstBarem = (maliyet + 88.49₺) / (1 - komisyon - hedef_kar)

EĞER desi > 10         → Desi tablosu
EĞER Satış_AltBarem < 150₺ → Alt barem (51.49₺)
EĞER Satış_ÜstBarem < 300₺ → Üst barem (88.49₺)
YOKSA                  → Desi tablosu
```

## Supabase Geçişi

`js/state.js` dosyasındaki `sync` objesi hazır.
Supabase credentials girilince otomatik devreye girer.

Gerekli tablolar:
```sql
create table urunler (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alis_fiyati numeric,
  stok integer default 0,
  desi integer default 1,
  komisyon numeric default 0.04,
  kategori text,
  created_at timestamptz default now()
);

create table satislar (
  id uuid primary key default gen_random_uuid(),
  urun_id uuid references urunler(id),
  adet integer not null,
  tarih date not null,
  kullanici_id uuid,
  created_at timestamptz default now()
);
```
