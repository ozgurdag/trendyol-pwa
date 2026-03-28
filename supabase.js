/* ── SUPABASE · supabase.js ──────────────────────────────────── */
const SB_URL = 'https://zburwdqwpoxpocymkutk.supabase.co';
const SB_KEY = 'sb_publishable_XipAv4wzmw8iTx6k942DkA_A8CkKh_X';

// Kullanıcı rolleri — email ile eşleştir
// Supabase'de bu email'leri Authentication → Users'dan ekleyin

/* ── CİHAZ KİMLİĞİ ──────────────────────────────────────────── */
function cihazId(){
  let id = localStorage.getItem('tsx_cihaz_id');
  if(!id){
    id = crypto.randomUUID ? crypto.randomUUID() :
      'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem('tsx_cihaz_id', id);
  }
  return id;
}

async function oturumKaydet(kullaniciId){
  // Bu cihazı aktif oturum olarak kaydet
  const r = await fetch(`${SB_URL}/rest/v1/aktif_oturumlar`, {
    method: 'POST',
    headers: { ...hdr(SB_KEY), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      kullanici_id: kullaniciId,
      cihaz_id: cihazId(),
      giris_zamani: new Date().toISOString(),
      son_aktif: new Date().toISOString(),
    }),
  });
  return r.ok;
}

async function oturumKontrol(kullaniciId){
  // Supabase'deki kayıtlı cihaz bu cihaz mı?
  const r = await fetch(
    `${SB_URL}/rest/v1/aktif_oturumlar?kullanici_id=eq.${kullaniciId}`,
    { headers: hdr(SB_KEY) }
  );
  if(!r.ok) return true; // Kontrol edilemezse geçir (offline tolerans)
  const data = await r.json();
  if(!data.length) return true; // Kayıt yoksa geçir
  return data[0].cihaz_id === cihazId(); // Kayıtlı cihaz bu mu?
}

async function oturumSonlandir(kullaniciId){
  await fetch(
    `${SB_URL}/rest/v1/aktif_oturumlar?kullanici_id=eq.${kullaniciId}`,
    { method: 'DELETE', headers: hdr(SB_KEY) }
  );
}

const ROLLER = {
  'admin@trendyol-satis.com':  'admin',
  'ortak@trendyol-satis.com':  'ortak',
};

const hdr = (token) => ({
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': `Bearer ${token || SB_KEY}`,
  'Prefer': 'return=representation',
});

/* ── AUTH ─────────────────────────────────────────────────────── */
export const sbAuth = {
  async girisYap(email, sifre) {
    try {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
        body: JSON.stringify({ email, password: sifre }),
      });
      const data = await r.json();
      if (!r.ok) return { hata: data.error_description || data.msg || 'Giriş başarısız' };

      const rol = ROLLER[email] || 'ortak';
      const oturum = {
        id: data.user.id,
        email: data.user.email,
        rol,
        ad: rol === 'admin' ? 'Admin' : 'Ortak',
        token: data.access_token,
        refresh: data.refresh_token,
        bitis: Date.now() + (data.expires_in * 1000),
        ortakKod: 'TSX2026',
      };
      localStorage.setItem('tsx_oturum', JSON.stringify(oturum));
      // Bu cihazı aktif oturum olarak kaydet (diğer cihazları devre dışı bırakır)
      await oturumKaydet(data.user.id).catch(()=>{});
      return { ok: true, kullanici: oturum };
    } catch(e) {
      return { hata: 'Bağlantı hatası: ' + e.message };
    }
  },

  async tokenYenile() {
    const o = this.oturum();
    if (!o?.refresh) return false;
    try {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
        body: JSON.stringify({ refresh_token: o.refresh }),
      });
      if (!r.ok) { this.cikis(); return false; }
      const data = await r.json();
      const yeni = { ...o, token: data.access_token, bitis: Date.now() + (data.expires_in * 1000) };
      localStorage.setItem('tsx_oturum', JSON.stringify(yeni));
      return true;
    } catch(e) { return false; }
  },

  oturum() {
    try { return JSON.parse(localStorage.getItem('tsx_oturum')); }
    catch(e) { return null; }
  },

  async gecerliToken() {
    const o = this.oturum();
    if (!o) return null;
    // Token süresi dolmak üzereyse yenile (5 dakika kala)
    if (Date.now() > o.bitis - 5 * 60 * 1000) {
      const ok = await this.tokenYenile();
      if (!ok) return null;
    }
    // Cihaz kontrolü - başka cihazdan giriş yapıldı mı? (60 saniyede bir)
    const simdi = Date.now();
    const sonKontrol = parseInt(localStorage.getItem('tsx_son_kontrol')||'0');
    if(simdi - sonKontrol > 60000){
      localStorage.setItem('tsx_son_kontrol', simdi);
      const gecerli = await oturumKontrol(o.id).catch(()=>true);
      if(!gecerli){
        this.cikis();
        alert('⚠️ Başka bir cihazdan giriş yapıldı. Oturumunuz sonlandırıldı.');
        window.location.href = './index.html';
        return null;
      }
    }
    return this.oturum()?.token;
  },

  rol() { return this.oturum()?.rol || null; },
  adminMi() { return this.rol() === 'admin'; },
  cikis() {
    const o = this.oturum();
    if(o?.id) oturumSonlandir(o.id).catch(()=>{});
    localStorage.removeItem('tsx_oturum');
  },
};

/* ── REST YARDIMCILARI ─────────────────────────────────────────── */
async function getToken() {
  return await sbAuth.gecerliToken() || SB_KEY;
}

async function sbGet(tablo, filtre=''){
  const token = await getToken();
  const r = await fetch(`${SB_URL}/rest/v1/${tablo}?${filtre}`, { headers: hdr(token) });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbInsert(tablo, veri){
  const token = await getToken();
  const r = await fetch(`${SB_URL}/rest/v1/${tablo}`, {
    method: 'POST', headers: hdr(token), body: JSON.stringify(veri)
  });
  if(!r.ok){ console.error('sbInsert:', await r.text()); return null; }
  return r.json();
}
async function sbUpdate(tablo, id, veri){
  const token = await getToken();
  const r = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`, {
    method: 'PATCH', headers: hdr(token), body: JSON.stringify(veri)
  });
  if(!r.ok) console.error('sbUpdate:', await r.text());
}
async function sbDelete(tablo, id){
  const token = await getToken();
  const r = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`, {
    method: 'DELETE', headers: hdr(token)
  });
  if(!r.ok) console.error('sbDelete:', await r.text());
}

/* ── BROADCAST REALTIME ─────────────────────────────────────── */
let broadcastWs = null;
let broadcastCallback = null;

function realtimeBaglant(token){
  if(broadcastWs?.readyState === WebSocket.OPEN) return;
  const url = SB_URL.replace('https','wss') +
    '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0';
  broadcastWs = new WebSocket(url);
  broadcastWs.onopen = () => {
    if(broadcastWs.readyState !== WebSocket.OPEN) return;
    try {
      broadcastWs.send(JSON.stringify({
        topic: 'realtime:satis-yonetim', event: 'phx_join',
        payload: { config: { broadcast: { self: false } } }, ref: '1'
      }));
    } catch(e){}
  };
  broadcastWs.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if(msg.event==='broadcast' && msg.payload?.event==='veri_guncellendi' && broadcastCallback)
        broadcastCallback();
    } catch(e){}
  };
  broadcastWs.onclose = () => setTimeout(() => realtimeBaglant(token), 5000);
  broadcastWs.onerror = () => { broadcastWs = null; };
}

async function broadcastGonder(){
  if(broadcastWs?.readyState !== WebSocket.OPEN) return;
  try {
    broadcastWs.send(JSON.stringify({
      topic: 'realtime:satis-yonetim', event: 'broadcast',
      payload: { event: 'veri_guncellendi', ts: Date.now() }, ref: '2'
    }));
  } catch(e){}
}

/* ── ANA NESNE ────────────────────────────────────────────────── */
export const sb = {
  bagliMi: false,
  sirketId: null,

  async baslat(kullanici){
    try {
      let sirket = null;
      if(kullanici.rol === 'admin'){
        const list = await sbGet('sirketler', `ortak_kod=eq.${kullanici.ortakKod}`).catch(()=>[]);
        if(list?.length) sirket = list[0];
        else {
          const yeni = await sbInsert('sirketler', { ad:'Satış Yönetim', ortak_kod: kullanici.ortakKod });
          sirket = Array.isArray(yeni) ? yeni[0] : yeni;
        }
      } else {
        const list = await sbGet('sirketler').catch(()=>[]);
        sirket = list?.[0] || null;
      }
      if(!sirket?.id) throw new Error('Şirket bulunamadı');
      this.sirketId = sirket.id;
      this.bagliMi = true;

      broadcastCallback = async () => {
        await this.tamSenkronize();
        window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
      };
      realtimeBaglant(kullanici.token);

      // İlk açılışta Supabase'den veriyi çek
      // (localStorage boşsa veya son syncten 5 dk geçtiyse)
      const sonSync = parseInt(localStorage.getItem('tsx_son_sync')||'0');
      const localUrunSayisi = JSON.parse(localStorage.getItem('tsx_urunler')||'[]').length;
      if(localUrunSayisi === 0 || Date.now() - sonSync > 5 * 60 * 1000){
        await this.tamSenkronize();
        localStorage.setItem('tsx_son_sync', Date.now().toString());
        window.dispatchEvent(new CustomEvent('tsx_veri_guncellendi'));
      }

      return { ok: true };
    } catch(e){
      console.warn('Supabase offline:', e.message);
      this.bagliMi = false;
      return { hata: e.message };
    }
  },

  async tamSenkronize(){
    if(!this.sirketId) return;
    const [sbUrunler, sbSatislar] = await Promise.all([
      sbGet('urunler', `sirket_id=eq.${this.sirketId}`).catch(()=>[]),
      sbGet('satislar', `sirket_id=eq.${this.sirketId}`).catch(()=>[]),
    ]);

    const localUrunler = JSON.parse(localStorage.getItem('tsx_urunler')||'[]');
    const localMap = Object.fromEntries(localUrunler.map(u=>[u.id,u]));
    const sbIds = new Set((sbUrunler||[]).map(u=>u.id));

    const merged = (sbUrunler||[]).map(u=>({
      id:u.id, ad:u.ad,
      alisFiyati:    u.alis_fiyati,
      stok:          u.stok,
      desi:          u.desi,
      komisyon:      u.komisyon,
      kategori:      u.kategori,
      tarih:         u.created_at?.slice(0,10),
      tip:           u.tip           || localMap[u.id]?.tip           || 'stok',
      hedefKar:      u.hedef_kar     ?? localMap[u.id]?.hedefKar     ?? 0.30,
      ayniGunKargo:  u.ayni_gun_kargo ?? localMap[u.id]?.ayniGunKargo ?? false,
      paketAdet:     u.paket_adet    || localMap[u.id]?.paketAdet    || 1,
      stokUrunId:    u.stok_urun_id  || localMap[u.id]?.stokUrunId   || null,
      kategori1:     u.kategori1     || localMap[u.id]?.kategori1    || null,
      kategori2:     u.kategori2     || localMap[u.id]?.kategori2    || null,
      urunGrubu:     u.urun_grubu    || localMap[u.id]?.urunGrubu    || null,
      satisFiyatiGercek: u.satis_fiyati_gercek || localMap[u.id]?.satisFiyatiGercek || null,
    }));

    const sadeceLokalde = localUrunler.filter(u => !sbIds.has(u.id));
    const final = [...new Map([...merged,...sadeceLokalde].map(u=>[u.id,u])).values()];
    localStorage.setItem('tsx_urunler', JSON.stringify(final));

    const localSatislar = JSON.parse(localStorage.getItem('tsx_satislar')||'[]');
    const localSatisMap = Object.fromEntries(localSatislar.map(s=>[s.id,s]));
    const sbSatisIds = new Set((sbSatislar||[]).map(s=>s.id));
    const mergedSatislar = (sbSatislar||[]).map(s=>({
      id:s.id,
      hedefId:    s.hedef_id || s.urun_id,
      urunId:     s.urun_id,
      tip:        s.tip          || localSatisMap[s.id]?.tip          || 'urun',
      adet:       s.adet,
      gercekFiyat:s.gercek_fiyat || localSatisMap[s.id]?.gercekFiyat || null,
      tarih:      s.tarih,
      kayitTarih: new Date(s.created_at).getTime(),
    }));
    const sadeceLokaldeSatis = localSatislar.filter(s=>!sbSatisIds.has(s.id));
    const finalSatislar = [...new Map([...mergedSatislar,...sadeceLokaldeSatis].map(s=>[s.id,s])).values()];
    localStorage.setItem('tsx_satislar', JSON.stringify(finalSatislar));
  },

  async urunEkle(u){
    if(!this.bagliMi||!this.sirketId) return;
    await sbInsert('urunler',{
      id:u.id, sirket_id:this.sirketId, ad:u.ad,
      alis_fiyati:u.alisFiyati, stok:u.stok||0, desi:u.desi||1,
      komisyon:u.komisyon||0.04, kategori:u.kategori||'',
      tip:u.tip||'stok', hedef_kar:u.hedefKar||0.30,
      ayni_gun_kargo:u.ayniGunKargo||false, paket_adet:u.paketAdet||1,
      stok_urun_id:u.stokUrunId||null,
      kategori1:u.kategori1||null, kategori2:u.kategori2||null,
      urun_grubu:u.urunGrubu||null,
      satis_fiyati_gercek:u.satisFiyatiGercek||null,
    }).catch(console.error);
    broadcastGonder();
  },
  async urunGuncelle(id,d){
    if(!this.bagliMi||!this.sirketId) return;
    const v={};
    if(d.alisFiyati!==undefined) v.alis_fiyati=d.alisFiyati;
    if(d.stok!==undefined) v.stok=d.stok;
    if(d.desi!==undefined) v.desi=d.desi;
    if(d.komisyon!==undefined) v.komisyon=d.komisyon;
    if(d.tip!==undefined) v.tip=d.tip;
    if(d.hedefKar!==undefined) v.hedef_kar=d.hedefKar;
    if(d.ayniGunKargo!==undefined) v.ayni_gun_kargo=d.ayniGunKargo;
    if(d.satisFiyatiGercek!==undefined) v.satis_fiyati_gercek=d.satisFiyatiGercek;
    if(d.urunGrubu!==undefined) v.urun_grubu=d.urunGrubu;
    if(Object.keys(v).length) await sbUpdate('urunler',id,v).catch(console.error);
    broadcastGonder();
  },
  async urunSil(id){
    if(!this.bagliMi||!this.sirketId) return;
    await sbDelete('urunler',id).catch(console.error);
    broadcastGonder();
  },
  async satisEkle(satislar){
    if(!this.bagliMi||!this.sirketId) return;
    await sbInsert('satislar', satislar.map(s=>({
      id:s.id, sirket_id:this.sirketId,
      urun_id: s.tip==='set' ? null : (s.hedefId||s.urunId||null),
      hedef_id: s.hedefId||s.urunId||null,
      tip:s.tip||'urun', adet:s.adet,
      gercek_fiyat:s.gercekFiyat||null, tarih:s.tarih,
    }))).catch(console.error);
    broadcastGonder();
  },
  async satisSil(id){
    if(!this.bagliMi||!this.sirketId) return;
    await sbDelete('satislar',id).catch(console.error);
    broadcastGonder();
  },
};

/* ── OTOMATİK BAĞLANTI ─────────────────────────────────────── */
const _o = (() => { try { return JSON.parse(localStorage.getItem('tsx_oturum')); } catch(e){ return null; } })();
if(_o?.token){
  sb.baslat(_o).then(sonuc=>{
    if(sonuc.ok){
      const badge = document.getElementById('topbar-senkron');
      if(badge){ badge.textContent='⬤ Canlı'; badge.className='badge badge-green'; }
    }
  });
}
