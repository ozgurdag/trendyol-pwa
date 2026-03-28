/* ── SATIŞ YÖNETİM · state.js ────────────────────────────────── */

const DB_KEYS = {
  urunler:'tsx_urunler', setler:'tsx_setler',
  satislar:'tsx_satislar', ayarlar:'tsx_ayarlar',
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
  cikis(){ localStorage.removeItem('tsx_oturum'); localStorage.removeItem('tsx_sirket_id'); },
};

/* ── SUPABASE YARDIMCILARI ── */
const SB_URL = 'https://zburwdqwpoxpocymkutk.supabase.co';
const SB_KEY = 'sb_publishable_XipAv4wzmw8iTx6k942DkA_A8CkKh_X';

// Token yenileme (1 saat sonra sürüyor)
async function gecerliToken(){
  const o = auth.oturum();
  if(!o) return SB_KEY;
  // Token 5 dakikadan az kaldıysa yenile
  if(o.bitis && Date.now() > o.bitis - 5*60*1000){
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
      } else {
        // Token yenilenemedi - çıkış yap
        auth.cikis();
        window.location.href='./index.html';
        return null;
      }
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

async function sirketId(){
  const cached = localStorage.getItem('tsx_sirket_id');
  if(cached) return cached;
  try {
    const token = await gecerliToken();
    const r = await fetch(`${SB_URL}/rest/v1/sirketler?select=id&limit=1`,{headers:sbHdr(token)});
    const d = await r.json();
    if(d?.[0]?.id){ localStorage.setItem('tsx_sirket_id',d[0].id); return d[0].id; }
  } catch(e){}
  return null;
}

async function sbPost(tablo, veri){
  try {
    const token = await gecerliToken(); if(!token) return;
    const sid = await sirketId(); if(!sid) return;
    const payload = Array.isArray(veri)
      ? veri.map(v=>({...v,sirket_id:sid}))
      : {...veri,sirket_id:sid};
    const r = await fetch(`${SB_URL}/rest/v1/${tablo}`,{
      method:'POST',
      headers:{...sbHdr(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(payload)
    });
    if(!r.ok) console.warn('sbPost:',tablo, await r.text());
  } catch(e){ console.warn('sbPost offline:',e.message); }
}

async function sbPatch(tablo, id, veri){
  try {
    const token = await gecerliToken(); if(!token) return;
    const r = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`,{
      method:'PATCH', headers:sbHdr(token), body:JSON.stringify(veri)
    });
    if(!r.ok) console.warn('sbPatch:',await r.text());
  } catch(e){ console.warn('sbPatch offline:',e.message); }
}

async function sbDelete(tablo, id){
  try {
    const token = await gecerliToken(); if(!token) return;
    const r = await fetch(`${SB_URL}/rest/v1/${tablo}?id=eq.${id}`,{
      method:'DELETE', headers:sbHdr(token)
    });
    if(!r.ok) console.warn('sbDelete:',await r.text());
  } catch(e){ console.warn('sbDelete offline:',e.message); }
}

/* ── REALTIME BROADCAST ── */
let _ws = null;
function realtimeBaglat(){
  if(_ws?.readyState === 1) return;
  const o = auth.oturum(); if(!o?.token) return;
  try {
    const url = SB_URL.replace('https','wss')+'/realtime/v1/websocket?apikey='+SB_KEY+'&vsn=1.0.0';
    _ws = new WebSocket(url);
    _ws.onopen = ()=>{
      _ws.send(JSON.stringify({topic:'realtime:tsx-satis',event:'phx_join',payload:{config:{broadcast:{self:false}}},ref:'1'}));
    };
    _ws.onmessage = async e=>{
      try {
        const msg = JSON.parse(e.data);
        if(msg.event==='broadcast' && msg.payload?.event==='veri_guncellendi'){
          // Başka cihazdan değişiklik geldi - yenile
          localStorage.removeItem('tsx_son_sync');
          await supabasedenYukle();
          window.dispatchEvent(new CustomEvent('tsx_render'));
        }
      } catch(e){}
    };
    _ws.onclose = ()=>{ _ws=null; setTimeout(realtimeBaglat, 5000); };
    _ws.onerror = ()=>{ _ws=null; };
  } catch(e){}
}

async function broadcastGonder(){
  if(_ws?.readyState !== 1) return;
  try {
    _ws.send(JSON.stringify({topic:'realtime:tsx-satis',event:'broadcast',payload:{event:'veri_guncellendi',ts:Date.now()},ref:'2'}));
  } catch(e){}
}

/* ── SUPABASE'DEN YÜKLE ── */
export async function supabasedenYukle(){
  try {
    const token = await gecerliToken(); if(!token) return false;
    const sid = await sirketId(); if(!sid) return false;

    const [rU, rS, rSt] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/urunler?sirket_id=eq.${sid}&select=*`,{headers:sbHdr(token)}),
      fetch(`${SB_URL}/rest/v1/setler?sirket_id=eq.${sid}&select=*`,{headers:sbHdr(token)}),
      fetch(`${SB_URL}/rest/v1/satislar?sirket_id=eq.${sid}&select=*&order=tarih.desc`,{headers:sbHdr(token)}),
    ]);

    if(rU.ok){
      const sbU = await rU.json();
      if(sbU?.length){
        set(DB_KEYS.urunler, sbU.map(u=>({
          id:u.id, ad:u.ad, alisFiyati:u.alis_fiyati, stok:u.stok,
          desi:u.desi, komisyon:u.komisyon, kategori:u.kategori,
          tarih:u.created_at?.slice(0,10), tip:u.tip||'stok',
          hedefKar:u.hedef_kar??0.30, ayniGunKargo:u.ayni_gun_kargo??false,
          paketAdet:u.paket_adet||1, stokUrunId:u.stok_urun_id||null,
          kategori1:u.kategori1||null, kategori2:u.kategori2||null,
          urunGrubu:u.urun_grubu||null, satisFiyatiGercek:u.satis_fiyati_gercek||null,
          stokBilesenleri:u.stok_bilesenleri||[],
        })));
      }
    }

    if(rS.ok){
      const sbS = await rS.json();
      if(sbS?.length){
        set(DB_KEYS.setler, sbS.map(s=>({
          id:s.id, ad:s.ad, desi:s.desi, komisyon:s.komisyon,
          alisMaliyeti:s.alis_maliyeti, hedefKar:s.hedef_kar??0.30,
          ayniGunKargo:s.ayni_gun_kargo??false,
          satisFiyatiGercek:s.satis_fiyati_gercek||null,
          icindekiler:s.icindekiler||[], tarih:s.created_at?.slice(0,10), tip:'set',
        })));
      }
    }

    if(rSt.ok){
      const sbSt = await rSt.json();
      if(sbSt?.length){
        set(DB_KEYS.satislar, sbSt.map(s=>({
          id:s.id, tip:s.tip||'urun', hedefId:s.hedef_id,
          adet:s.adet, gercekFiyat:s.gercek_fiyat||null,
          tarih:s.tarih, kayitTarih:new Date(s.created_at).getTime(),
        })));
      }
    }

    localStorage.setItem('tsx_son_sync', Date.now().toString());
    return true;
  } catch(e){
    console.warn('supabasedenYukle hata:',e.message);
    return false;
  }
}

/* ── LOCALSTORAGE'I SUPABASE'E YÜKLE (tek seferlik migrasyon) ── */
export async function localdenSupabaseYukle(){
  const token = await gecerliToken(); if(!token) return {ok:false};
  const sid = await sirketId(); if(!sid) return {ok:false};

  const urunler = get(DB_KEYS.urunler)||[];
  const setler  = get(DB_KEYS.setler)||[];
  const satislar = get(DB_KEYS.satislar)||[];

  let yuklenen = 0;

  // Urunler
  for(const u of urunler){
    try {
      const r = await fetch(`${SB_URL}/rest/v1/urunler`,{
        method:'POST',
        headers:{...sbHdr(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({
          id:u.id, sirket_id:sid, ad:u.ad,
          alis_fiyati:u.alisFiyati||0, stok:u.stok||0, desi:u.desi||1,
          komisyon:u.komisyon||0.04, kategori:u.kategori||'',
          tip:u.tip||'stok', hedef_kar:u.hedefKar||0.30,
          ayni_gun_kargo:u.ayniGunKargo||false, paket_adet:u.paketAdet||1,
          stok_urun_id:u.stokUrunId||null,
          kategori1:u.kategori1||null, kategori2:u.kategori2||null,
          urun_grubu:u.urunGrubu||null,
          satis_fiyati_gercek:u.satisFiyatiGercek||null,
          stok_bilesenleri:u.stokBilesenleri||[],
        })
      });
      if(r.ok) yuklenen++;
    } catch(e){}
  }

  // Setler
  for(const s of setler){
    try {
      await fetch(`${SB_URL}/rest/v1/setler`,{
        method:'POST',
        headers:{...sbHdr(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({
          id:s.id, sirket_id:sid, ad:s.ad, desi:s.desi||2,
          komisyon:s.komisyon||0.04, alis_maliyeti:s.alisMaliyeti||0,
          hedef_kar:s.hedefKar||0.30, ayni_gun_kargo:s.ayniGunKargo||false,
          satis_fiyati_gercek:s.satisFiyatiGercek||null,
          icindekiler:s.icindekiler||[],
        })
      });
      yuklenen++;
    } catch(e){}
  }

  // Satışlar
  for(const st of satislar){
    try {
      await fetch(`${SB_URL}/rest/v1/satislar`,{
        method:'POST',
        headers:{...sbHdr(token),'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({
          id:st.id, sirket_id:sid, tip:st.tip||'urun',
          hedef_id:st.hedefId, urun_id:st.tip!=='set'?(st.hedefId||null):null,
          adet:st.adet, gercek_fiyat:st.gercekFiyat||null, tarih:st.tarih,
        })
      });
      yuklenen++;
    } catch(e){}
  }

  return {ok:true, yuklenen, toplam: urunler.length+setler.length+satislar.length};
}

/* ── URUNLER DB ── */
export const urunlerDB = {
  hepsini(){ return get(DB_KEYS.urunler)||[]; },
  bul(id){ return this.hepsini().find(u=>u.id===id); },
  stokUrunler(){ return this.hepsini().filter(u=>u.tip==='stok'||!u.tip); },
  olusturulanlar(){ return this.hepsini().filter(u=>u.tip==='urun'); },

  ekle(urun){
    const mevcut = this.hepsini();
    const var_mi = mevcut.find(u=>u.ad.trim()===(urun.ad||'').trim());
    if(var_mi) return var_mi;
    const yeni = {id:uid(),...urun,stok:urun.stok??0,tarih:today()};
    set(DB_KEYS.urunler,[...mevcut,yeni]);
    sbPost('urunler',{
      id:yeni.id, ad:yeni.ad, alis_fiyati:yeni.alisFiyati||0,
      stok:yeni.stok, desi:yeni.desi||1, komisyon:yeni.komisyon||0.04,
      kategori:yeni.kategori||'', tip:yeni.tip||'stok',
      hedef_kar:yeni.hedefKar||0.30, ayni_gun_kargo:yeni.ayniGunKargo||false,
      paket_adet:yeni.paketAdet||1, stok_urun_id:yeni.stokUrunId||null,
      kategori1:yeni.kategori1||null, kategori2:yeni.kategori2||null,
      urun_grubu:yeni.urunGrubu||null,
      satis_fiyati_gercek:yeni.satisFiyatiGercek||null,
      stok_bilesenleri:yeni.stokBilesenleri||[],
    }).then(()=>broadcastGonder());
    return yeni;
  },

  guncelle(id,d){
    set(DB_KEYS.urunler,this.hepsini().map(u=>u.id===id?{...u,...d}:u));
    const v={};
    if(d.alisFiyati!==undefined)        v.alis_fiyati=d.alisFiyati;
    if(d.stok!==undefined)              v.stok=d.stok;
    if(d.desi!==undefined)              v.desi=d.desi;
    if(d.komisyon!==undefined)          v.komisyon=d.komisyon;
    if(d.tip!==undefined)               v.tip=d.tip;
    if(d.hedefKar!==undefined)          v.hedef_kar=d.hedefKar;
    if(d.ayniGunKargo!==undefined)      v.ayni_gun_kargo=d.ayniGunKargo;
    if(d.satisFiyatiGercek!==undefined) v.satis_fiyati_gercek=d.satisFiyatiGercek;
    if(d.kategori1!==undefined)         v.kategori1=d.kategori1;
    if(d.kategori2!==undefined)         v.kategori2=d.kategori2;
    if(d.urunGrubu!==undefined)         v.urun_grubu=d.urunGrubu;
    if(d.stokBilesenleri!==undefined)   v.stok_bilesenleri=d.stokBilesenleri;
    if(Object.keys(v).length) sbPatch('urunler',id,v).then(()=>broadcastGonder());
  },

  sil(id){
    set(DB_KEYS.urunler,this.hepsini().filter(u=>u.id!==id));
    sbDelete('urunler',id).then(()=>broadcastGonder());
  },
};

/* ── SETLER DB ── */
export const setlerDB = {
  hepsini(){ return get(DB_KEYS.setler)||[]; },
  bul(id){ return this.hepsini().find(s=>s.id===id); },

  ekle(s){
    const yeni={id:uid(),...s,tarih:today()};
    set(DB_KEYS.setler,[...this.hepsini(),yeni]);
    sbPost('setler',{
      id:yeni.id, ad:yeni.ad, desi:yeni.desi||2,
      komisyon:yeni.komisyon||0.04, alis_maliyeti:yeni.alisMaliyeti||0,
      hedef_kar:yeni.hedefKar||0.30, ayni_gun_kargo:yeni.ayniGunKargo||false,
      satis_fiyati_gercek:yeni.satisFiyatiGercek||null,
      icindekiler:yeni.icindekiler||[],
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
    if(d.satisFiyatiGercek!==undefined) v.satis_fiyati_gercek=d.satisFiyatiGercek;
    if(d.icindekiler!==undefined)       v.icindekiler=d.icindekiler;
    if(Object.keys(v).length) sbPatch('setler',id,v).then(()=>broadcastGonder());
  },

  sil(id){
    set(DB_KEYS.setler,this.hepsini().filter(s=>s.id!==id));
    sbDelete('setler',id).then(()=>broadcastGonder());
  },

  alisMaliyeti(id){
    const s=this.bul(id);if(!s)return 0;
    return(s.icindekiler||[]).reduce((t,ic)=>{
      const u=urunlerDB.bul(ic.urunId);return t+(u?u.alisFiyati*ic.adet:0);
    },0);
  },
  maxAdet(id){
    const s=this.bul(id);if(!s||!(s.icindekiler||[]).length)return 0;
    return Math.min(...(s.icindekiler||[]).map(ic=>{
      const u=urunlerDB.bul(ic.urunId);
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
      id:uid(),tip:k.tip||'urun',hedefId:k.hedefId,
      adet:k.adet,gercekFiyat:k.gercekFiyat,
      tarih:k.tarih||today(),kayitTarih:Date.now()
    }));
    set(DB_KEYS.satislar,[...this.hepsini(),...yeniler]);

    yeniler.forEach(k=>{
      if(k.tip==='urun'||k.tip==='stok'){
        const u=urunlerDB.bul(k.hedefId);if(!u)return;
        const adet=k.adet*(u.paketAdet||1);
        urunlerDB.guncelle(k.hedefId,{stok:Math.max(0,(u.stok||0)-k.adet)});
        if(u.stokUrunId){
          const su=urunlerDB.bul(u.stokUrunId);
          if(su)urunlerDB.guncelle(u.stokUrunId,{stok:Math.max(0,(su.stok||0)-adet)});
        }
        (u.stokBilesenleri||[]).forEach(b=>{
          const bu=urunlerDB.bul(b.urunId);
          if(bu)urunlerDB.guncelle(b.urunId,{stok:Math.max(0,(bu.stok||0)-b.adet*k.adet)});
        });
      } else {
        const s=setlerDB.bul(k.hedefId);
        if(s)(s.icindekiler||[]).forEach(ic=>{
          const u=urunlerDB.bul(ic.urunId);
          if(u)urunlerDB.guncelle(ic.urunId,{stok:Math.max(0,(u.stok||0)-ic.adet*k.adet)});
        });
      }
    });

    sbPost('satislar',yeniler.map(k=>({
      id:k.id,tip:k.tip,hedef_id:k.hedefId,
      urun_id:k.tip!=='set'?(k.hedefId||null):null,
      adet:k.adet,gercek_fiyat:k.gercekFiyat||null,tarih:k.tarih,
    }))).then(()=>broadcastGonder());
    return yeniler;
  },

  sil(id){
    const k=this.hepsini().find(s=>s.id===id);
    if(k){
      if(k.tip!=='set'){
        const u=urunlerDB.bul(k.hedefId);
        if(u){
          urunlerDB.guncelle(k.hedefId,{stok:(u.stok||0)+k.adet});
          (u.stokBilesenleri||[]).forEach(b=>{
            const bu=urunlerDB.bul(b.urunId);
            if(bu)urunlerDB.guncelle(b.urunId,{stok:(bu.stok||0)+b.adet*k.adet});
          });
        }
      } else {
        const s=setlerDB.bul(k.hedefId);
        if(s)(s.icindekiler||[]).forEach(ic=>{
          const u=urunlerDB.bul(ic.urunId);
          if(u)urunlerDB.guncelle(ic.urunId,{stok:(u.stok||0)+ic.adet*k.adet});
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
};

export function demoYukle(){}

/* ── SAYFA AÇILIŞINDA OTOMATİK SYNC + REALTIME ── */
(async()=>{
  const o = auth.oturum();
  if(!o?.token) return;

  // Realtime WebSocket bağla
  realtimeBaglat();

  // 5 dakikadan fazla geçtiyse Supabase'den çek
  const sonSync = parseInt(localStorage.getItem('tsx_son_sync')||'0');
  if(Date.now() - sonSync > 5*60*1000){
    const ok = await supabasedenYukle();
    if(ok) window.dispatchEvent(new CustomEvent('tsx_render'));
  }
})();
