/* ── SATIŞ YÖNETİM · state.js ────────────────────────────────── */

/* ── TİP TANIMLARI ─────────────────────────────────────────────
   stokDB    → Fiziksel stok kalemleri (stok_kalemleri tablosu)
   listingDB → Trendyol'daki ürün kartları (listingler tablosu)
   setlerDB  → Set ürünler (setler tablosu)
   satislarDB → Satış kayıtları (satislar tablosu)
────────────────────────────────────────────────────────────────*/

const DB_KEYS = {
  stok:    'tsx_stok_kalemleri',
  listing: 'tsx_listingler',
  setler:  'tsx_setler',
  satislar:'tsx_satislar',
  ayarlar: 'tsx_ayarlar',
};

const get  = k=>{try{return JSON.parse(localStorage.getItem(k))??null;}catch{return null;}};
const set  = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uid  = ()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});
const today= ()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

/* ── AUTH ── */
export const auth = {
  oturum(){ try{ return JSON.parse(localStorage.getItem('tsx_oturum')); }catch(e){return null;} },
  rol(){ return this.oturum()?.rol || null; },
  adminMi(){ return this.rol() === 'admin'; },
  cikis(){
    localStorage.removeItem('tsx_oturum');
    localStorage.removeItem('tsx_sirket_id');
  },
};

/* ── SUPABASE ── */
const SB_URL = 'https://zburwdqwpoxpocymkutk.supabase.co';
const SB_KEY = 'sb_publishable_XipAv4wzmw8iTx6k942DkA_A8CkKh_X';

async function gecerliToken(){
  const o = auth.oturum();
  if(!o?.token) return SB_KEY;
  if(!o.bitis) return o.token;
  if(Date.now() > o.bitis - 5*60*1000){
    try {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SB_KEY},
        body:JSON.stringify({refresh_token:o.refresh})
      });
      if(r.ok){
        const d = await r.json();
        const yeni = {...o, token:d.access_token, bitis:Date.now()+(d.expires_in*1000)};
        localStorage.setItem('tsx_oturum', JSON.stringify(yeni));
        return d.access_token;
      } else { auth.cikis(); window.location.href='./index.html'; return null; }
    } catch(e){ return o.token; }
  }
  return o.token || SB_KEY;
}

function sbHdr(token){
  return {
    'Content-Type':'application/json',
    'apikey':SB_KEY,
    'Authorization':`Bearer ${token||SB_KEY}`,
    'Prefer':'return=representation',
  };
}

async function sbPost(tablo, veri){
  try {
    const token = await gecerliToken();
    if(!token || token===SB_KEY){ console.warn('sbPost: token yok'); return; }
    const r = await fetch(`${SB_URL}/rest/v1/${tablo}`,{
      method:'POST',
      headers:{...sbHdr(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(veri)
    });
    if(!r.ok) console.warn('sbPost',tablo, await r.text());
  } catch(e){ console.warn('sbPost offline:',e.message); }
}

async function sbPatch(tablo, id, veri){
  try {
    const token = await gecerliToken();
    if(!token || token===SB_KEY) return;
    const r = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`,{
      method:'PATCH', headers:sbHdr(token), body:JSON.stringify(veri)
    });
    if(!r.ok) console.warn('sbPatch',tablo, await r.text());
  } catch(e){ console.warn('sbPatch offline:',e.message); }
}

async function sbDelete(tablo, id){
  try {
    const token = await gecerliToken();
    if(!token || token===SB_KEY) return;
    await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`,{
      method:'DELETE', headers:sbHdr(token)
    });
  } catch(e){ console.warn('sbDelete offline:',e.message); }
}

/* ── REALTIME ── */
let _ws = null;
function realtimeBaglat(){
  if(_ws?.readyState===1) return;
  const o = auth.oturum(); if(!o?.token) return;
  try {
    const url = SB_URL.replace('https','wss')+'/realtime/v1/websocket?apikey='+SB_KEY+'&vsn=1.0.0';
    _ws = new WebSocket(url);
    _ws.onopen = ()=>_ws.send(JSON.stringify({topic:'realtime:tsx',event:'phx_join',payload:{config:{broadcast:{self:false}}},ref:'1'}));
    _ws.onmessage = async e=>{
      try {
        const msg=JSON.parse(e.data);
        if(msg.event==='broadcast'&&msg.payload?.event==='veri_guncellendi'){
          localStorage.removeItem('tsx_son_sync');
          await supabasedenYukle();
          window.dispatchEvent(new CustomEvent('tsx_render'));
        }
      } catch(e){}
    };
    _ws.onclose = ()=>{ _ws=null; setTimeout(realtimeBaglat,5000); };
    _ws.onerror = ()=>{ _ws=null; };
  } catch(e){}
}
async function broadcastGonder(){
  if(_ws?.readyState!==1) return;
  try { _ws.send(JSON.stringify({topic:'realtime:tsx',event:'broadcast',payload:{event:'veri_guncellendi',ts:Date.now()},ref:'2'})); }
  catch(e){}
}

/* ── SUPABASE'DEN YÜKLE ── */
export async function supabasedenYukle(){
  try {
    const token = await gecerliToken();
    if(!token||token===SB_KEY) return false;

    const [rS, rL, rSet, rSt] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/stok_kalemleri?select=*&order=ad`,{headers:sbHdr(token)}),
      fetch(`${SB_URL}/rest/v1/listingler?select=*&order=ad`,{headers:sbHdr(token)}),
      fetch(`${SB_URL}/rest/v1/setler?select=*&order=ad`,{headers:sbHdr(token)}),
      fetch(`${SB_URL}/rest/v1/satislar?select=*&order=tarih.desc`,{headers:sbHdr(token)}),
    ]);

    if(rS.ok){ const d=await rS.json(); if(d?.length) set(DB_KEYS.stok, d.map(u=>({
      id:u.id, ad:u.ad, alisFiyati:u.alis_fiyati, stok:u.stok, desi:u.desi||1,
      komisyon:u.komisyon||0.04, kategori:u.kategori||'',
      kategori1:u.kategori1||null, kategori2:u.kategori2||null, urunGrubu:u.urun_grubu||null,
      tedarikSuresi:u.tedarik_suresi||5, kritikEsikManuel:u.kritik_esik_manuel||null,
      tarih:u.created_at?.slice(0,10),
    }))); }

    if(rL.ok){ const d=await rL.json(); if(d?.length) {
      const stoklar = get(DB_KEYS.stok)||[];
      set(DB_KEYS.listing, d.map(l=>{
        const bilesenler = l.stok_bilesenleri||[];
        // alisFiyati: stok kalemlerinden hesapla
        const alisFiyati = bilesenler.reduce((t,b)=>{
          const u=stoklar.find(s=>s.id===b.urunId);
          return t+(u?(u.alisFiyati||0)*b.adet:0);
        },0);
        return {
          id:l.id, ad:l.ad, satisFiyatiGercek:l.satis_fiyati, komisyon:l.komisyon||0.04,
          kategori1:l.kategori1||null, ayniGunKargo:l.ayni_gun_kargo||false,
          desi:l.desi||1, hedefKar:l.hedef_kar||0.30,
          stokBilesenleri:bilesenler, onaylandi:l.onaylandi||false,
          alisFiyati: alisFiyati,
          tarih:l.created_at?.slice(0,10),
        };
      }));
    }}

    if(rSet.ok){ const d=await rSet.json(); if(d?.length) set(DB_KEYS.setler, d.map(s=>({
      id:s.id, ad:s.ad, desi:s.desi||2, komisyon:s.komisyon||0.04,
      alisMaliyeti:s.alis_maliyeti||0, hedefKar:s.hedef_kar||0.30,
      ayniGunKargo:s.ayni_gun_kargo||false, satisFiyatiGercek:s.satis_fiyati||null,
      icindekiler:s.icindekiler||[], onaylandi:s.onaylandi||false,
      tarih:s.created_at?.slice(0,10),
    }))); }

    if(rSt.ok){ const d=await rSt.json(); if(d?.length) set(DB_KEYS.satislar, d.map(s=>({
      id:s.id, tip:s.tip||'listing', hedefId:s.hedef_id,
      adet:s.adet, gercekFiyat:s.gercek_fiyat||null,
      tarih:s.tarih, kayitTarih:new Date(s.created_at).getTime(),
      snapshot:s.snapshot||null,
    }))); }

    localStorage.setItem('tsx_son_sync', Date.now().toString());
    return true;
  } catch(e){ console.warn('supabasedenYukle hata:',e.message); return false; }
}

/* ── MİGRASYON: localStorage → Supabase ── */
export async function localdenSupabaseYukle(){
  const token = await gecerliToken();
  if(!token||token===SB_KEY) return {ok:false};
  let yuklenen=0;

  for(const u of get(DB_KEYS.stok)||[]){
    await sbPost('stok_kalemleri',{
      id:u.id, ad:u.ad, alis_fiyati:u.alisFiyati||0, stok:u.stok||0,
      desi:u.desi||1, komisyon:u.komisyon||0.04, kategori:u.kategori||'',
      kategori1:u.kategori1||null, kategori2:u.kategori2||null, urun_grubu:u.urunGrubu||null,
      tedarik_suresi:u.tedarikSuresi||5, kritik_esik_manuel:u.kritikEsikManuel||null,
    });
    yuklenen++;
  }
  for(const l of get(DB_KEYS.listing)||[]){
    await sbPost('listingler',{
      id:l.id, ad:l.ad, satis_fiyati:l.satisFiyatiGercek||0,
      komisyon:l.komisyon||0.04, kategori1:l.kategori1||null,
      ayni_gun_kargo:l.ayniGunKargo||false, desi:l.desi||1,
      hedef_kar:l.hedefKar||0.30, stok_bilesenleri:l.stokBilesenleri||[],
      onaylandi:l.onaylandi||false,
    });
    yuklenen++;
  }
  for(const s of get(DB_KEYS.setler)||[]){
    await sbPost('setler',{
      id:s.id, ad:s.ad, desi:s.desi||2, komisyon:s.komisyon||0.04,
      alis_maliyeti:s.alisMaliyeti||0, hedef_kar:s.hedefKar||0.30,
      ayni_gun_kargo:s.ayniGunKargo||false, satis_fiyati:s.satisFiyatiGercek||null,
      icindekiler:s.icindekiler||[], onaylandi:s.onaylandi||false,
    });
    yuklenen++;
  }
  for(const st of get(DB_KEYS.satislar)||[]){
    await sbPost('satislar',{
      id:st.id, tip:st.tip||'listing', hedef_id:st.hedefId,
      adet:st.adet, gercek_fiyat:st.gercekFiyat||null, tarih:st.tarih,
    });
    yuklenen++;
  }
  return {ok:true, yuklenen};
}

/* ── STOK DB ── */
export const stokDB = {
  hepsini(){ return get(DB_KEYS.stok)||[]; },
  bul(id){ return this.hepsini().find(u=>u.id===id); },

  ekle(u){
    const mevcut = this.hepsini();
    const adNorm = (u.ad||'').trim().toLowerCase();
    const varMi = mevcut.find(x=>x.ad.trim().toLowerCase()===adNorm);
    if(varMi){
      // Alış fiyatı güncelle, stok adedini KORU
      const guncelleme = {alisFiyati:u.alisFiyati};
      if(u.desi) guncelleme.desi=u.desi;
      if(u.komisyon) guncelleme.komisyon=u.komisyon;
      if(u.kategori1) guncelleme.kategori1=u.kategori1;
      this.guncelle(varMi.id, guncelleme);
      return varMi;
    }
    const yeni = {id:uid(), ...u, stok:u.stok??0, tarih:today()};
    set(DB_KEYS.stok, [...mevcut, yeni]);
    sbPost('stok_kalemleri',{
      id:yeni.id, ad:yeni.ad, alis_fiyati:yeni.alisFiyati||0,
      stok:yeni.stok, desi:yeni.desi||1, komisyon:yeni.komisyon||0.04,
      kategori:yeni.kategori||'', kategori1:yeni.kategori1||null,
      kategori2:yeni.kategori2||null, urun_grubu:yeni.urunGrubu||null,
      tedarik_suresi:yeni.tedarikSuresi||5, kritik_esik_manuel:yeni.kritikEsikManuel||null,
    }).then(()=>broadcastGonder());
    return yeni;
  },

  guncelle(id,d){
    set(DB_KEYS.stok, this.hepsini().map(u=>u.id===id?{...u,...d}:u));
    const v={};
    if(d.alisFiyati!==undefined)        v.alis_fiyati=d.alisFiyati;
    if(d.stok!==undefined)              v.stok=d.stok;
    if(d.desi!==undefined)              v.desi=d.desi;
    if(d.komisyon!==undefined)          v.komisyon=d.komisyon;
    if(d.kategori1!==undefined)         v.kategori1=d.kategori1;
    if(d.kategori2!==undefined)         v.kategori2=d.kategori2;
    if(d.urunGrubu!==undefined)         v.urun_grubu=d.urunGrubu;
    if(d.tedarikSuresi!==undefined)     v.tedarik_suresi=d.tedarikSuresi;
    if(d.kritikEsikManuel!==undefined)  v.kritik_esik_manuel=d.kritikEsikManuel;
    if(Object.keys(v).length) sbPatch('stok_kalemleri',id,v).then(()=>broadcastGonder());
  },

  sil(id){
    set(DB_KEYS.stok, this.hepsini().filter(u=>u.id!==id));
    sbDelete('stok_kalemleri',id).then(()=>broadcastGonder());
  },
};

/* Geriye dönük uyumluluk için alias */
export const urunlerDB = {
  hepsini(){ return stokDB.hepsini(); },
  bul(id){ return stokDB.bul(id); },
  stokUrunler(){ return stokDB.hepsini(); },
  ekle(u){ return stokDB.ekle(u); },
  guncelle(id,d){ return stokDB.guncelle(id,d); },
  sil(id){ return stokDB.sil(id); },
  // listing ile ilgili metodlar listingDB'ye yönlendir
  listingler(){ return listingDB.hepsini(); },
  onaylananlar(){ return listingDB.onaylananlar(); },
  olusturulanlar(){ return listingDB.hepsini(); },
};

/* ── LISTING DB ── */
export const listingDB = {
  hepsini(){ return get(DB_KEYS.listing)||[]; },
  bul(id){ return this.hepsini().find(l=>l.id===id); },
  onaylananlar(){ return this.hepsini().filter(l=>l.onaylandi===true); },

  ekle(l){
    const mevcut = this.hepsini();
    const adNorm = (l.ad||'').trim().toLowerCase();
    const varMi = mevcut.find(x=>x.ad.trim().toLowerCase()===adNorm);
    if(varMi){
      // Var olanı güncelle — onay ve bileşen KORUNUR
      const g={};
      if(l.satisFiyatiGercek!==undefined) g.satisFiyatiGercek=l.satisFiyatiGercek;
      if(l.komisyon!==undefined)          g.komisyon=l.komisyon;
      if(l.ayniGunKargo!==undefined)      g.ayniGunKargo=l.ayniGunKargo;
      if(l.kategori1)                     g.kategori1=l.kategori1;
      this.guncelle(varMi.id, g);
      return varMi;
    }
    const yeni = {id:uid(), ...l, onaylandi:l.onaylandi??false, tarih:today()};
    set(DB_KEYS.listing, [...mevcut, yeni]);
    sbPost('listingler',{
      id:yeni.id, ad:yeni.ad, satis_fiyati:yeni.satisFiyatiGercek||0,
      komisyon:yeni.komisyon||0.04, kategori1:yeni.kategori1||null,
      ayni_gun_kargo:yeni.ayniGunKargo||false, desi:yeni.desi||1,
      hedef_kar:yeni.hedefKar||0.30, stok_bilesenleri:yeni.stokBilesenleri||[],
      onaylandi:yeni.onaylandi||false,
    }).then(()=>broadcastGonder());
    return yeni;
  },

  guncelle(id,d){
    set(DB_KEYS.listing, this.hepsini().map(l=>l.id===id?{...l,...d}:l));
    const v={};
    if(d.satisFiyatiGercek!==undefined) v.satis_fiyati=d.satisFiyatiGercek;
    if(d.komisyon!==undefined)          v.komisyon=d.komisyon;
    if(d.ayniGunKargo!==undefined)      v.ayni_gun_kargo=d.ayniGunKargo;
    if(d.kategori1!==undefined)         v.kategori1=d.kategori1;
    if(d.desi!==undefined)              v.desi=d.desi;
    if(d.hedefKar!==undefined)          v.hedef_kar=d.hedefKar;
    if(d.stokBilesenleri!==undefined)   v.stok_bilesenleri=d.stokBilesenleri;
    if(d.onaylandi!==undefined)         v.onaylandi=d.onaylandi;
    // alisFiyati localStorage'da tutulur, stok_bilesenleri üzerinden hesaplanır
    if(Object.keys(v).length) sbPatch('listingler',id,v).then(()=>broadcastGonder());
  },

  sil(id){
    set(DB_KEYS.listing, this.hepsini().filter(l=>l.id!==id));
    sbDelete('listingler',id).then(()=>broadcastGonder());
  },
};

/* ── SETLER DB ── */
export const setlerDB = {
  hepsini(){ return get(DB_KEYS.setler)||[]; },
  bul(id){ return this.hepsini().find(s=>s.id===id); },
  onaylananlar(){ return this.hepsini().filter(s=>s.onaylandi===true); },

  ekle(s){
    const adNorm=(s.ad||'').trim().toLowerCase();
    const mevcut=this.hepsini();
    const varMi=mevcut.find(x=>x.ad.trim().toLowerCase()===adNorm);
    if(varMi){
      const g={};
      if(s.satisFiyatiGercek!==undefined) g.satisFiyatiGercek=s.satisFiyatiGercek;
      if(s.komisyon!==undefined)          g.komisyon=s.komisyon;
      if(s.ayniGunKargo!==undefined)      g.ayniGunKargo=s.ayniGunKargo;
      this.guncelle(varMi.id,g);
      return varMi;
    }
    const yeni={id:uid(),...s,onaylandi:s.onaylandi??false,tarih:today()};
    set(DB_KEYS.setler,[...mevcut,yeni]);
    sbPost('setler',{
      id:yeni.id, ad:yeni.ad, desi:yeni.desi||2,
      komisyon:yeni.komisyon||0.04, alis_maliyeti:yeni.alisMaliyeti||0,
      hedef_kar:yeni.hedefKar||0.30, ayni_gun_kargo:yeni.ayniGunKargo||false,
      satis_fiyati:yeni.satisFiyatiGercek||null,
      icindekiler:yeni.icindekiler||[], onaylandi:yeni.onaylandi||false,
    }).then(()=>broadcastGonder());
    return yeni;
  },

  guncelle(id,d){
    set(DB_KEYS.setler,this.hepsini().map(s=>s.id===id?{...s,...d}:s));
    const v={};
    if(d.alisMaliyeti!==undefined)      v.alis_maliyeti=d.alisMaliyeti;
    if(d.desi!==undefined)              v.desi=d.desi;
    if(d.komisyon!==undefined)          v.komisyon=d.komisyon;
    if(d.hedefKar!==undefined)          v.hedef_kar=d.hedefKar;
    if(d.ayniGunKargo!==undefined)      v.ayni_gun_kargo=d.ayniGunKargo;
    if(d.satisFiyatiGercek!==undefined) v.satis_fiyati=d.satisFiyatiGercek;
    if(d.icindekiler!==undefined)       v.icindekiler=d.icindekiler;
    if(d.onaylandi!==undefined)         v.onaylandi=d.onaylandi;
    if(Object.keys(v).length) sbPatch('setler',id,v).then(()=>broadcastGonder());
  },

  sil(id){
    set(DB_KEYS.setler,this.hepsini().filter(s=>s.id!==id));
    sbDelete('setler',id).then(()=>broadcastGonder());
  },

  alisMaliyeti(id){
    const s=this.bul(id);if(!s)return 0;
    return(s.icindekiler||[]).reduce((t,ic)=>{
      const u=stokDB.bul(ic.urunId);return t+(u?u.alisFiyati*ic.adet:0);
    },0);
  },
  maxAdet(id){
    const s=this.bul(id);if(!s||!(s.icindekiler||[]).length)return 0;
    return Math.min(...(s.icindekiler||[]).map(ic=>{
      const u=stokDB.bul(ic.urunId);
      if(!u||!ic.adet)return 0;
      return Math.floor((u.stok||0)/ic.adet);
    }));
  },
};

/* ── SATISLAR DB ── */
export const satislarDB = {
  hepsini(){ return get(DB_KEYS.satislar)||[]; },

  ekle(kayitlar){
    const yeniler=kayitlar.map(k=>({
      id:uid(), tip:k.tip||'listing', hedefId:k.hedefId,
      adet:k.adet, gercekFiyat:k.gercekFiyat,
      tarih:k.tarih||today(), kayitTarih:Date.now(),
      snapshot:k.snapshot||null,  // anlık maliyet snapshot
    }));
    set(DB_KEYS.satislar,[...this.hepsini(),...yeniler]);

    // Stok düş
    yeniler.forEach(k=>{
      if(k.tip==='listing'){
        const l=listingDB.bul(k.hedefId);if(!l)return;
        (l.stokBilesenleri||[]).forEach(b=>{
          const u=stokDB.bul(b.urunId);
          if(u) stokDB.guncelle(b.urunId,{stok:Math.max(0,(u.stok||0)-b.adet*k.adet)});
        });
      } else if(k.tip==='set'){
        const s=setlerDB.bul(k.hedefId);
        if(s)(s.icindekiler||[]).forEach(ic=>{
          const u=stokDB.bul(ic.urunId);
          if(u) stokDB.guncelle(ic.urunId,{stok:Math.max(0,(u.stok||0)-ic.adet*k.adet)});
        });
      }
    });

    sbPost('satislar',yeniler.map(k=>({
      id:k.id, tip:k.tip, hedef_id:k.hedefId,
      adet:k.adet, gercek_fiyat:k.gercekFiyat||null, tarih:k.tarih,
      snapshot:k.snapshot||null,
    }))).then(()=>broadcastGonder());
    return yeniler;
  },

  sil(id){
    const k=this.hepsini().find(s=>s.id===id);
    if(k){
      if(k.tip==='listing'){
        const l=listingDB.bul(k.hedefId);
        if(l)(l.stokBilesenleri||[]).forEach(b=>{
          const u=stokDB.bul(b.urunId);
          if(u) stokDB.guncelle(b.urunId,{stok:(u.stok||0)+b.adet*k.adet});
        });
      } else if(k.tip==='set'){
        const s=setlerDB.bul(k.hedefId);
        if(s)(s.icindekiler||[]).forEach(ic=>{
          const u=stokDB.bul(ic.urunId);
          if(u) stokDB.guncelle(ic.urunId,{stok:(u.stok||0)+ic.adet*k.adet});
        });
      }
      set(DB_KEYS.satislar,this.hepsini().filter(s=>s.id!==id));
      sbDelete('satislar',id).then(()=>broadcastGonder());
    }
  },

  guneBGore(t){ return this.hepsini().filter(s=>s.tarih===t); },
  aralik(b,e){ return this.hepsini().filter(s=>s.tarih>=b&&s.tarih<=e); },
};

/* ── AYARLAR DB ── */
export const ayarlarDB = {
  varsayilan:{
    kargoBaremEsik1:150,kargoBaremUcret1:51.492,
    kargoBaremEsik2:300,kargoBaremUcret2:88.488,
    platformAyniGun:8.388,platformNormal:13.188,
    hedefKarROI:0.30,kargoFirma:'Aras',ayniGunKargo:false,
    saticiTipiKey:'KadinGir',
  },
  oku(){ return{...this.varsayilan,...(get(DB_KEYS.ayarlar)||{})}; },
  kaydet(d){ set(DB_KEYS.ayarlar,{...(get(DB_KEYS.ayarlar)||{}),...d}); },
};

/* ── HESAPLAMA MOTORU ── */
export const hesapla = {
  satisFiyati(urun,ayarlar,adet=1,kargoFU=null){
    const{kargoBaremEsik1:e1,kargoBaremUcret1:k1,kargoBaremEsik2:e2,kargoBaremUcret2:k2,platformAyniGun,platformNormal}=ayarlar;
    const aynigun=urun.ayniGunKargo!=null?urun.ayniGunKargo:(ayarlar.ayniGunKargo||false);
    const platform=aynigun?platformAyniGun:platformNormal;
    const kom=urun.komisyon||0.04;
    const hedef=urun.hedefKar!=null?urun.hedefKar:(ayarlar.hedefKarROI||0.30);
    const desi=urun.desi||1;
    const alis=(urun.alisFiyati||0)*adet;
    const reklam=urun.reklam||0;
    const payda=1-kom-hedef;
    const kargoFirmaUcret=kargoFU||100.716;
    if(payda<=0)return null;
    let kargo;
    if(desi>10){kargo=kargoFirmaUcret;}
    else{
      const mal=alis+platform+reklam;
      const sAlt=(mal+k1)/payda,sUst=(mal+k2)/payda;
      if(sAlt<e1)kargo=k1;else if(sUst<e2)kargo=k2;else kargo=kargoFirmaUcret;
    }
    const onerilen=(alis+platform+kargo+reklam)/payda;
    const yuvarlak=Math.ceil(onerilen)-0.01;
    const basabas=(alis+platform+kargo+reklam)/(1-kom);
    const netKar=yuvarlak-alis-platform-kargo-reklam-yuvarlak*kom;
    return{onerilen,yuvarlak,basabas,kargo,platform,kom,netKar,roi:alis>0?netKar/alis:0,alis,reklam,hedef,payda};
  },

  gercekKar(alisToplam,gercekFiyat,komisyon,platform,kargo,reklam=0){
    const net=gercekFiyat-alisToplam-platform-kargo-reklam-gercekFiyat*komisyon;
    return{net,roi:alisToplam>0?net/alisToplam:0,kararli:net>=0};
  },

  maxAlis(satisFiyati,komisyon,platform,kargo,roi,reklam=0){
    return(satisFiyati*(1-komisyon)-platform-kargo-reklam)/(1+roi);
  },

  kritikEsik(stokKalemId, satislar14, tedarikSuresi=5, hedefGun=14){
    const listingler=listingDB.hepsini();
    const setler=setlerDB.hepsini();
    let toplamGunlukTuketim=0;

    listingler.forEach(l=>{
      const b=(l.stokBilesenleri||[]).find(b=>b.urunId===stokKalemId);
      if(!b)return;
      const sayi=satislar14.filter(s=>s.hedefId===l.id&&s.tip==='listing').reduce((t,s)=>t+s.adet,0);
      toplamGunlukTuketim+=(sayi/14)*b.adet;
    });

    setler.forEach(s=>{
      const b=(s.icindekiler||[]).find(b=>b.urunId===stokKalemId);
      if(!b)return;
      const sayi=satislar14.filter(st=>st.hedefId===s.id&&st.tip==='set').reduce((t,st)=>t+st.adet,0);
      toplamGunlukTuketim+=(sayi/14)*b.adet;
    });

    const hesaplanan=Math.ceil(toplamGunlukTuketim*(tedarikSuresi+hedefGun));
    return{hesaplanan:hesaplanan||null,gunlukTuketim:toplamGunlukTuketim};
  },
};

export function demoYukle(){}

/* ── SAYFA AÇILIŞINDA OTOMATİK SYNC ── */
(async()=>{
  const o=auth.oturum();
  if(!o?.token)return;
  realtimeBaglat();
  const sonSync=parseInt(localStorage.getItem('tsx_son_sync')||'0');
  if(Date.now()-sonSync>5*60*1000){
    const ok=await supabasedenYukle();
    if(ok) window.dispatchEvent(new CustomEvent('tsx_render'));
  }
})();
