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

export function realtimeDinle(tablo, callback) {
  listeners[tablo] = callback;
  if (realtimeWs?.readyState === WebSocket.OPEN) return;

  const wsUrl = SB_URL.replace('https', 'wss') + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';
  realtimeWs = new WebSocket(wsUrl);

  realtimeWs.onopen = () => {
    realtimeWs.send(JSON.stringify({
      topic: 'realtime:public',
      event: 'phx_join',
      payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
      ref: '1'
    }));
  };

  realtimeWs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === 'postgres_changes') {
      const { table } = msg.payload;
      if (listeners[table]) listeners[table](msg.payload);
    }
  };

  realtimeWs.onerror = () => { realtimeWs = null; };
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
      // Şirket yoksa oluştur, varsa bul
      let sirket = null;
      if (kullanici.rol === 'sahip') {
        const existing = await sbGet('sirketler', `ortak_kod=eq.${kullanici.ortakKod}`);
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
      console.error('Supabase başlatma hatası:', e);
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
    const urunlerLocal = urunler.map(u => ({
      id:         u.id,
      ad:         u.ad,
      alisFiyati: u.alis_fiyati,
      stok:       u.stok,
      desi:       u.desi,
      komisyon:   u.komisyon,
      kategori:   u.kategori,
      tarih:      u.created_at?.slice(0,10),
    }));
    const satislarLocal = satislar.map(s => ({
      id:        s.id,
      urunId:    s.urun_id,
      adet:      s.adet,
      tarih:     s.tarih,
      kayitTarih: new Date(s.created_at).getTime(),
    }));
    localStorage.setItem('tsx_urunler',  JSON.stringify(urunlerLocal));
    localStorage.setItem('tsx_satislar', JSON.stringify(satislarLocal));
  },

  /* Realtime bağlantı */
  _realtimeBaglant() {
    realtimeDinle('urunler', async () => {
      await this.tamSenkronize();
      window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
    });
    realtimeDinle('satislar', async () => {
      await this.tamSenkronize();
      window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
    });
  },

  /* ── ÜRÜN İŞLEMLERİ ──────────────────────────────────────── */
  async urunEkle(urun) {
    if (!this.bagliMi || !this.sirketId) return null;
    const sbVeri = {
      id:          urun.id,
      sirket_id:   this.sirketId,
      ad:          urun.ad,
      alis_fiyati: urun.alisFiyati,
      stok:        urun.stok || 0,
      desi:        urun.desi || 1,
      komisyon:    urun.komisyon || 0.04,
      kategori:    urun.kategori || '',
    };
    return sbInsert('urunler', sbVeri).catch(console.error);
  },

  async urunGuncelle(id, degisiklik) {
    if (!this.bagliMi) return;
    const sbVeri = {};
    if (degisiklik.alisFiyati !== undefined) sbVeri.alis_fiyati = degisiklik.alisFiyati;
    if (degisiklik.stok       !== undefined) sbVeri.stok        = degisiklik.stok;
    if (degisiklik.desi       !== undefined) sbVeri.desi        = degisiklik.desi;
    if (degisiklik.ad         !== undefined) sbVeri.ad          = degisiklik.ad;
    if (degisiklik.komisyon   !== undefined) sbVeri.komisyon    = degisiklik.komisyon;
    return sbUpdate('urunler', id, sbVeri).catch(console.error);
  },

  async urunSil(id) {
    if (!this.bagliMi) return;
    return sbDelete('urunler', id).catch(console.error);
  },

  /* ── SATIŞ İŞLEMLERİ ─────────────────────────────────────── */
  async satisEkle(satislar) {
    if (!this.bagliMi || !this.sirketId) return;
    const sbVeri = satislar.map(s => ({
      id:        s.id,
      sirket_id: this.sirketId,
      urun_id:   s.urunId,
      adet:      s.adet,
      tarih:     s.tarih,
    }));
    return sbInsert('satislar', sbVeri).catch(console.error);
  },

  async satisSil(id) {
    if (!this.bagliMi) return;
    return sbDelete('satislar', id).catch(console.error);
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
