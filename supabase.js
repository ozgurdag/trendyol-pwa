/* ── SUPABASE SYNC KATMANI ───────────────────────────────────────
   state.js bu modülü import eder.
   localStorage ile Supabase arasında köprü görevi görür.
──────────────────────────────────────────────────────────────── */

const SB_URL = 'https://zburwdqwpoxpocymkutk.supabase.co';
const SB_KEY = 'sb_publishable_XipAv4wzmw8iTx6k942DkA_A8CkKh_X';

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer':        'return=representation',
};

/* ── TEMEL CRUD ──────────────────────────────────────────────── */
async function sbGet(tablo, filter = '') {
  const res = await fetch(`${SB_URL}/rest/v1/${tablo}?${filter}&order=created_at.asc`, {
    headers: { ...HEADERS, 'Prefer': 'return=representation' }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsert(tablo, veri) {
  const res = await fetch(`${SB_URL}/rest/v1/${tablo}`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify(Array.isArray(veri) ? veri : [veri])
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbUpdate(tablo, id, veri) {
  const res = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`, {
    method: 'PATCH', headers: HEADERS,
    body: JSON.stringify(veri)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbDelete(tablo, id) {
  const res = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`, {
    method: 'DELETE', headers: { ...HEADERS, 'Prefer': '' }
  });
  if (!res.ok) throw new Error(await res.text());
}

/* ── REALTIME (Websocket) ────────────────────────────────────── */
let realtimeWs = null;
const listeners = {};

export // Broadcast tabanlı realtime - kendi değişikliklerimizi tetiklemez
let broadcastWs = null;
let benimDeğişikliğim = false; // kendi yazdığımız değişiklikleri işaretler

function realtimeDinle(kanal, callback) {
  if (broadcastWs?.readyState === WebSocket.OPEN) return;
  const wsUrl = SB_URL.replace('https','wss') + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';
  broadcastWs = new WebSocket(wsUrl);

  broadcastWs.onopen = () => {
    if (broadcastWs.readyState !== WebSocket.OPEN) return;
    try {
      // Broadcast kanalına abone ol (postgres değil)
      broadcastWs.send(JSON.stringify({
        topic: 'realtime:satis-yonetim',
        event: 'phx_join',
        payload: { config: { broadcast: { self: false } } }, // self:false = kendi mesajlarımı alma
        ref: '1'
      }));
    } catch(e) {}
  };

  broadcastWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      // Ortak tarafından gelen broadcast - veriyi senkronize et
      if (msg.event === 'broadcast' && msg.payload?.event === 'veri_guncellendi') {
        if (!benimDeğişikliğim) callback();
      }
    } catch(e) {}
  };

  broadcastWs.onerror = () => { broadcastWs = null; };
  broadcastWs.onclose = () => {
    // 5 saniye sonra yeniden bağlan
    setTimeout(() => realtimeDinle(kanal, callback), 5000);
  };
}

// Ortağa "veri değişti" sinyali gönder
async function broadcastGonder() {
  if (broadcastWs?.readyState !== WebSocket.OPEN) return;
  try {
    broadcastWs.send(JSON.stringify({
      topic: 'realtime:satis-yonetim',
      event: 'broadcast',
      payload: { event: 'veri_guncellendi', ts: Date.now() },
      ref: '2'
    }));
  } catch(e) {}
}

/* ── KULLANICI / ŞİRKET ──────────────────────────────────────── */
let sirketId = localStorage.getItem('tsx_sirket_id');

async function sirketBul(ortakKod) {
  const data = await sbGet('sirketler', `ortak_kod=eq.${ortakKod}`);
  return data[0] || null;
}

async function sirketOlustur(ad, ortakKod) {
  const data = await sbInsert('sirketler', { ad, ortak_kod: ortakKod });
  return data[0];
}

/* ── SENKRONIZASYON ──────────────────────────────────────────── */
export const sb = {
  bagliMi: false,
  sirketId: null,

  /* İlk bağlantı + şirket kaydı */
  async baslat(kullanici) {
    try {
      // Önce Supabase'in erişilebilir olup olmadığını kontrol et
      let sirket = null;
      if (kullanici.rol === 'sahip') {
        const existing = await sbGet('sirketler', `ortak_kod=eq.${kullanici.ortakKod}`).catch(()=>[]);
        if (existing.length) {
          sirket = existing[0];
        } else {
          sirket = (await sbInsert('sirketler', {
            ad: kullanici.ad + ' Mağazası',
            ortak_kod: kullanici.ortakKod
          }))[0];
        }
      } else if (kullanici.rol === 'ortak') {
        // Ortak kodu ile şirketi bul
        const sahip = JSON.parse(localStorage.getItem('tsx_kullanici'));
        sirket = await sirketBul(sahip?.ortakKod || '');
      }

      if (!sirket) throw new Error('Şirket bulunamadı');
      this.sirketId = sirket.id;
      sirketId = sirket.id;
      localStorage.setItem('tsx_sirket_id', sirket.id);
      this.bagliMi = true;

      // Tüm veriyi Supabase'den çek ve localStorage'a yaz
      await this.tamSenkronize();

      // Realtime dinle
      this._realtimeBaglant();

      console.log('✅ Supabase bağlantısı kuruldu, sirket:', sirket.id);
      return { ok: true };
    } catch (e) {
      // Supabase tabloları henüz oluşturulmamış olabilir
      // supabase-tablolar.sql dosyasını Supabase SQL Editor'da çalıştırın
      console.warn('Supabase bağlanamadı, offline modda devam ediliyor. SQL tabloları oluşturuldu mu?');
      this.bagliMi = false;
      return { hata: e.message };
    }
  },

  /* Tüm veriyi Supabase → localStorage */
  async tamSenkronize() {
    if (!this.sirketId) return;
    const [urunler, satislar] = await Promise.all([
      sbGet('urunler', `sirket_id=eq.${this.sirketId}`),
      sbGet('satislar', `sirket_id=eq.${this.sirketId}`)
    ]);
    // localStorage formatına uyarla
    // Mevcut localStorage verisiyle merge et - tip, hedefKar vb. alanları koru
    const mevcutUrunler = JSON.parse(localStorage.getItem('tsx_urunler') || '[]');
    const mevcutMap = Object.fromEntries(mevcutUrunler.map(u => [u.id, u]));

    const urunlerLocal = urunler.map(u => ({
      // Supabase'den gelen alanlar
      id:         u.id,
      ad:         u.ad,
      alisFiyati: u.alis_fiyati,
      stok:       u.stok,
      desi:       u.desi,
      komisyon:   u.komisyon,
      kategori:   u.kategori,
      tarih:      u.created_at?.slice(0,10),
      // Hem Supabase'deki hem localStorage'daki ek alanları al
      tip:               u.tip || mevcutMap[u.id]?.tip || 'stok',
      hedefKar:          u.hedef_kar || mevcutMap[u.id]?.hedefKar || 0.30,
      ayniGunKargo:      u.ayni_gun_kargo ?? mevcutMap[u.id]?.ayniGunKargo ?? false,
      paketAdet:         u.paket_adet || mevcutMap[u.id]?.paketAdet || 1,
      stokUrunId:        u.stok_urun_id || mevcutMap[u.id]?.stokUrunId || null,
      kategori1:         u.kategori1 || mevcutMap[u.id]?.kategori1 || null,
      kategori2:         u.kategori2 || mevcutMap[u.id]?.kategori2 || null,
      urunGrubu:         u.urun_grubu || mevcutMap[u.id]?.urunGrubu || null,
      satisFiyatiGercek: u.satis_fiyati_gercek || mevcutMap[u.id]?.satisFiyatiGercek || null,
    }));
    // Mevcut localStorage satışlarıyla merge için map
    const mevcutSatislar = JSON.parse(localStorage.getItem('tsx_satislar')||'[]');
    const mevcutSatisMap = Object.fromEntries(mevcutSatislar.map(s=>[s.id,s]));

    const satislarLocal = satislar.map(s => ({
      id:          s.id,
      // Yeni format: hedefId + tip
      hedefId:     s.urun_id || s.hedef_id,
      tip:         s.tip || mevcutSatisMap[s.id]?.tip || 'urun',
      adet:        s.adet,
      gercekFiyat: s.gercek_fiyat || mevcutSatisMap[s.id]?.gercekFiyat,
      tarih:       s.tarih,
      kayitTarih:  new Date(s.created_at).getTime(),
      // Geriye dönük uyumluluk
      urunId:      s.urun_id,
    }));
    // Çift kayıt önle: Sadece Supabase'den gelen ID'leri güncelle
    // localStorage'da olup Supabase'de olmayan kayıtları koru (yeni eklenenler)
    const sbIds = new Set(urunlerLocal.map(u => u.id));
    const sadeceLocal = (JSON.parse(localStorage.getItem('tsx_urunler')||'[]'))
      .filter(u => !sbIds.has(u.id)); // Supabase'de henüz olmayan yeni kayıtlar
    localStorage.setItem('tsx_urunler', JSON.stringify([...urunlerLocal, ...sadeceLocal]));

    const sbSatisIds = new Set(satislarLocal.map(s => s.id));
    const sadeceSatis = (JSON.parse(localStorage.getItem('tsx_satislar')||'[]'))
      .filter(s => !sbSatisIds.has(s.id));
    localStorage.setItem('tsx_satislar', JSON.stringify([...satislarLocal, ...sadeceSatis]));
  },

  /* Realtime bağlantı */
  _realtimeBaglant() {
    // Realtime değişikliklerinde kısa gecikme ile sync yap
    // (kendi yazdığımız değişiklikler localStorage'da zaten var)
    let syncTimer = null;
    realtimeDinle('urunler', async () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        await this.tamSenkronize();
        window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
      }, 2000); // 2 saniye bekle - stok düşümleri tamamlansın
    });
    realtimeDinle('satislar', async () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        await this.tamSenkronize();
        window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
      }, 1000);
    });
  },

  /* ── ÜRÜN İŞLEMLERİ ──────────────────────────────────────── */
  async urunEkle(urun) {
    if (!this.bagliMi || !this.sirketId) return null;
    const sbVeri = {
      id:                  urun.id,
      sirket_id:           this.sirketId,
      ad:                  urun.ad,
      alis_fiyati:         urun.alisFiyati,
      stok:                urun.stok || 0,
      desi:                urun.desi || 1,
      komisyon:            urun.komisyon || 0.04,
      kategori:            urun.kategori || '',
      tip:                 urun.tip || 'stok',
      hedef_kar:           urun.hedefKar || 0.30,
      ayni_gun_kargo:      urun.ayniGunKargo || false,
      paket_adet:          urun.paketAdet || 1,
      stok_urun_id:        urun.stokUrunId || null,
      kategori1:           urun.kategori1 || null,
      kategori2:           urun.kategori2 || null,
      urun_grubu:          urun.urunGrubu || null,
      satis_fiyati_gercek: urun.satisFiyatiGercek || null,
    };
    return sbInsert('urunler', sbVeri).then(r => { broadcastGonder(); return r; }).catch(console.error);
  },

  async urunGuncelle(id, degisiklik) {
    if (!this.bagliMi) return;
    const sbVeri = {};
    if (degisiklik.alisFiyati !== undefined) sbVeri.alis_fiyati = degisiklik.alisFiyati;
    if (degisiklik.stok       !== undefined) sbVeri.stok        = degisiklik.stok;
    if (degisiklik.desi       !== undefined) sbVeri.desi        = degisiklik.desi;
    if (degisiklik.ad         !== undefined) sbVeri.ad          = degisiklik.ad;
    if (degisiklik.komisyon   !== undefined) sbVeri.komisyon    = degisiklik.komisyon;
    return sbUpdate('urunler', id, sbVeri).then(r => { broadcastGonder(); return r; }).catch(console.error);
  },

  async urunSil(id) {
    if (!this.bagliMi) return;
    return sbDelete('urunler', id).then(r => { broadcastGonder(); return r; }).catch(console.error);
  },

  /* ── SATIŞ İŞLEMLERİ ─────────────────────────────────────── */
  async satisEkle(satislar) {
    if (!this.bagliMi || !this.sirketId) return;
    const sbVeri = satislar.map(s => ({
      id:           s.id,
      sirket_id:    this.sirketId,
      // urun_id sadece tip:'urun' için - set için null (foreign key hatası önle)
      urun_id:      (s.tip==='set') ? null : (s.hedefId || s.urunId || null),
      hedef_id:     s.hedefId || s.urunId || null,
      tip:          s.tip || 'urun',
      adet:         s.adet,
      gercek_fiyat: s.gercekFiyat || null,
      tarih:        s.tarih,
    }));
    return sbInsert('satislar', sbVeri).then(r => { broadcastGonder(); return r; }).catch(console.error);
  },

  async satisSil(id) {
    if (!this.bagliMi) return;
    return sbDelete('satislar', id).then(r => { broadcastGonder(); return r; }).catch(console.error);
  },
};

/* ── OTOMATIK BAGLANTI ───────────────────────────────────────── */
// Sayfa yüklenince oturum varsa otomatik bağlan
const oturum = JSON.parse(localStorage.getItem('tsx_oturum') || localStorage.getItem('tsx_oturum_ortak') || 'null');
if (oturum) {
  sb.baslat(oturum).then(sonuc => {
    if (sonuc.ok) {
      // Bağlandı badge güncelle
      const badge = document.getElementById('topbar-senkron');
      if (badge) { badge.textContent = '⬤ Canlı'; badge.className = 'badge badge-green'; }
      window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
    }
  });
}
