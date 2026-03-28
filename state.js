/* ── SATIŞ YÖNETİM · state.js ────────────────────────────────── */

const DB_KEYS = {
  urunler:'tsx_urunler', setler:'tsx_setler',
  satislar:'tsx_satislar', ayarlar:'tsx_ayarlar',
  kullanici:'tsx_kullanici', ortak:'tsx_ortak',
};

const get  = k=>{try{return JSON.parse(localStorage.getItem(k))??null;}catch{return null;}};
const set  = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uid  = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today= ()=>new Date().toISOString().slice(0,10);

export const auth = {
  girisYap(email,sifre){
    const k=get(DB_KEYS.kullanici);
    if(!k) return{hata:'Hesap bulunamadı'};
    if(k.email!==email||k.sifre!==sifre) return{hata:'E-posta veya şifre hatalı'};
    set('tsx_oturum',{...k,giris:Date.now()}); return{ok:true,kullanici:k};
  },
  kayitOl(email,sifre,ad){
    if(get(DB_KEYS.kullanici)) return{hata:'Bu cihazda zaten hesap var'};
    const k={id:uid(),email,sifre,ad,rol:'sahip',ortakKod:uid().slice(0,8).toUpperCase(),tarih:today()};
    set(DB_KEYS.kullanici,k); set('tsx_oturum',{...k,giris:Date.now()}); return{ok:true,kullanici:k};
  },
  ortakGiris(email,sifre,ortakKod){
    const sahip=get(DB_KEYS.kullanici);
    if(!sahip||sahip.ortakKod!==ortakKod) return{hata:'Ortak kodu hatalı'};
    const ortaklar=get(DB_KEYS.ortak)||[];
    let ortak=ortaklar.find(o=>o.email===email);
    if(!ortak){
      if(sifre.length<6) return{hata:'Şifre en az 6 karakter'};
      ortak={id:uid(),email,sifre,ad:email.split('@')[0],rol:'ortak',tarih:today()};
      set(DB_KEYS.ortak,[...ortaklar,ortak]);
    } else if(ortak.sifre!==sifre) return{hata:'Şifre hatalı'};
    set('tsx_oturum_ortak',{...ortak,giris:Date.now()}); return{ok:true,kullanici:ortak};
  },
  oturum(){
    const o=get('tsx_oturum')||get('tsx_oturum_ortak');
    if(!o) return null;
    if(Date.now()-o.giris>30*24*60*60*1000){this.cikis();return null;}
    return o;
  },
  cikis(){ localStorage.removeItem('tsx_oturum'); localStorage.removeItem('tsx_oturum_ortak'); },
};

export const urunlerDB = {
  hepsini(){ return get(DB_KEYS.urunler)||[]; },
  bul(id){ return this.hepsini().find(u=>u.id===id); },
  // tip: 'stok' = sadece stokta, 'urun' = fiyatlar sayfasında oluşturulmuş
  ekle(urun){
    const yeni={id:uid(),...urun,stok:urun.stok??0,tarih:today()};
    set(DB_KEYS.urunler,[...this.hepsini(),yeni]); return yeni;
  },
  guncelle(id,d){ set(DB_KEYS.urunler,this.hepsini().map(u=>u.id===id?{...u,...d}:u)); },
  sil(id){ set(DB_KEYS.urunler,this.hepsini().filter(u=>u.id!==id)); },
  // Sadece stok ürünleri (set/ürün oluştururken seçim için)
  stokUrunler(){ return this.hepsini().filter(u=>u.tip==='stok'||!u.tip); },
  // Sadece fiyatlar sayfasında oluşturulanlar (kartlarda gösterilecek)
  olusturulanlar(){ return this.hepsini().filter(u=>u.tip==='urun'); },
};

export const setlerDB = {
  hepsini(){ return get(DB_KEYS.setler)||[]; },
  bul(id){ return this.hepsini().find(s=>s.id===id); },
  ekle(s){
    const yeni={id:uid(),...s,tarih:today()};
    set(DB_KEYS.setler,[...this.hepsini(),yeni]); return yeni;
  },
  guncelle(id,d){ set(DB_KEYS.setler,this.hepsini().map(s=>s.id===id?{...s,...d}:s)); },
  sil(id){ set(DB_KEYS.setler,this.hepsini().filter(s=>s.id!==id)); },
  alisMaliyeti(id){
    const s=this.bul(id); if(!s) return 0;
    return(s.icindekiler||[]).reduce((t,ic)=>{
      const u=urunlerDB.bul(ic.urunId); return t+(u?u.alisFiyati*ic.adet:0);
    },0);
  },
};

export const satislarDB = {
  hepsini(){ return get(DB_KEYS.satislar)||[]; },
  ekle(kayitlar){
    const yeniler=kayitlar.map(k=>({
      id:uid(), tip:k.tip||'urun', hedefId:k.hedefId,
      adet:k.adet, gercekFiyat:k.gercekFiyat,
      tarih:k.tarih||today(), kayitTarih:Date.now()
    }));
    set(DB_KEYS.satislar,[...this.hepsini(),...yeniler]);
    yeniler.forEach(k=>{
      if(k.tip==='urun'||k.tip==='stok'){
        const u=urunlerDB.bul(k.hedefId);
        if(!u) return;
        const adet=k.adet*(u.paketAdet||1); // paket ise her birimi düş
        // Önce oluşturulan ürünün stokunu düş
        urunlerDB.guncelle(k.hedefId,{stok:Math.max(0,(u.stok||0)-k.adet)});
        // Eğer stokUrunId varsa (stok kaynağı) oradan da düş
        if(u.stokUrunId){
          const su=urunlerDB.bul(u.stokUrunId);
          if(su) urunlerDB.guncelle(u.stokUrunId,{stok:Math.max(0,(su.stok||0)-adet)});
        }
      } else {
        // Set satışı: içindeki stok ürünlerinden düş
        const s=setlerDB.bul(k.hedefId);
        if(s){
          (s.icindekiler||[]).forEach(ic=>{
            // ic.urunId = oluşturulan ürün veya stok ürünü olabilir
            const u=urunlerDB.bul(ic.urunId);
            if(u){
              const dusAdet=ic.adet*k.adet;
              urunlerDB.guncelle(ic.urunId,{stok:Math.max(0,(u.stok||0)-dusAdet)});
              // stok kaynağından da düş
              if(u.stokUrunId){
                const su=urunlerDB.bul(u.stokUrunId);
                if(su) urunlerDB.guncelle(u.stokUrunId,{stok:Math.max(0,(su.stok||0)-dusAdet)});
              }
            } else {
              // ic.urunId direkt stok ürünü ise
              const su=urunlerDB.bul(ic.urunId);
              if(su) urunlerDB.guncelle(ic.urunId,{stok:Math.max(0,(su.stok||0)-ic.adet*k.adet)});
            }
          });
        }
      }
    });
    return yeniler;
  },
  sil(id){
    const k=this.hepsini().find(s=>s.id===id);
    if(k){
      if(k.tip!=='set'){
        const u=urunlerDB.bul(k.hedefId);
        if(u) urunlerDB.guncelle(k.hedefId,{stok:(u.stok||0)+k.adet});
      } else {
        const s=setlerDB.bul(k.hedefId);
        if(s)(s.icindekiler||[]).forEach(ic=>{
          const u=urunlerDB.bul(ic.urunId);
          if(u) urunlerDB.guncelle(ic.urunId,{stok:(u.stok||0)+(ic.adet*k.adet)});
        });
      }
      set(DB_KEYS.satislar,this.hepsini().filter(s=>s.id!==id));
    }
  },
  guneBGore(t){ return this.hepsini().filter(s=>s.tarih===t); },
  aralik(b,e){ return this.hepsini().filter(s=>s.tarih>=b&&s.tarih<=e); },
};

export const ayarlarDB = {
  varsayilan:{
    kargoBaremEsik1:150, kargoBaremUcret1:51.492,
    kargoBaremEsik2:300, kargoBaremUcret2:88.488,
    platformAyniGun:8.388, platformNormal:13.188,
    hedefKarROI:0.30, kargoFirma:'Aras', ayniGunKargo:false,
    saticiTipiKey:'KadinGir',
  },
  oku(){ return{...this.varsayilan,...(get(DB_KEYS.ayarlar)||{})}; },
  kaydet(d){ set(DB_KEYS.ayarlar,{...(get(DB_KEYS.ayarlar)||{}),...d}); },
};

/* ── HESAPLAMA MOTORU ────────────────────────────────────────── */
export const hesapla = {
  // Self-consistent barem (döngüsüz)
  // kargoFU = desi tablosundan gelen gerçek kargo ücreti (kargo.js'den)
  satisFiyati(urun, ayarlar, adet=1, kargoFU=null){
    const{kargoBaremEsik1:e1,kargoBaremUcret1:k1,
          kargoBaremEsik2:e2,kargoBaremUcret2:k2,
          platformAyniGun,platformNormal}=ayarlar;
    const aynigun = urun.ayniGunKargo!=null ? urun.ayniGunKargo : (ayarlar.ayniGunKargo||false);
    const platform = aynigun ? platformAyniGun : platformNormal;
    const kom    = urun.komisyon || 0.04;
    const hedef  = urun.hedefKar!=null ? urun.hedefKar : (ayarlar.hedefKarROI||0.30);
    const desi   = urun.desi || 1;
    const alis   = (urun.alisFiyati||0) * adet;
    const reklam = urun.reklam || 0;
    const payda  = 1 - kom - hedef;
    // Gerçek kargo firması ücreti (parametre olarak gelir, yoksa varsayılan)
    const kargoFirmaUcret = kargoFU || 100.716;
    if(payda<=0) return null;

    let kargo;
    if(desi>10){
      // Desi>10: her zaman desi tablosu
      kargo=kargoFirmaUcret;
    } else {
      // Self-consistent barem seçimi
      const mal=alis+platform+reklam;
      const sAlt=(mal+k1)/payda;
      const sUst=(mal+k2)/payda;
      if(sAlt<e1)      kargo=k1;
      else if(sUst<e2) kargo=k2;
      else             kargo=kargoFirmaUcret;
    }

    const onerilen=(alis+platform+kargo+reklam)/payda;
    const yuvarlak=Math.ceil(onerilen)-0.01;
    const basabas=(alis+platform+kargo+reklam)/(1-kom);
    const netKar=yuvarlak-alis-platform-kargo-reklam-yuvarlak*kom;
    return{onerilen,yuvarlak,basabas,kargo,platform,kom,netKar,
           roi:alis>0?netKar/alis:0,alis,reklam,hedef,payda};
  },

  // Gerçek satış fiyatıyla kar
  gercekKar(alisToplam,gercekFiyat,komisyon,platform,kargo,reklam=0){
    const net=gercekFiyat-alisToplam-platform-kargo-reklam-gercekFiyat*komisyon;
    return{net,roi:alisToplam>0?net/alisToplam:0,kararli:net>=0};
  },

  maxAlis(satisFiyati,komisyon,platform,kargo,roi,reklam=0){
    return(satisFiyati*(1-komisyon)-platform-kargo-reklam)/(1+roi);
  },
};

export function demoYukle(){
  if(get(DB_KEYS.urunler)?.length) return;
  [
    {ad:"Dalin Bebe Sabunu Avokado (100 gr)",     alisFiyati:37,    stok:48,desi:1,komisyon:0.04},
    {ad:"Johnson's Baby Bebek Losyonu (300 ml)",   alisFiyati:141.9, stok:24,desi:1,komisyon:0.04},
    {ad:"Sudocrem Pişik Kremi (60 gr)",            alisFiyati:58.5,  stok:36,desi:1,komisyon:0.04},
    {ad:"Dalin Şampuan Normal (700 ml)",           alisFiyati:77.5,  stok:30,desi:2,komisyon:0.04},
    {ad:"Bepanthol Baby Merhem (50 gr)",           alisFiyati:72.9,  stok:18,desi:1,komisyon:0.04},
    {ad:"Sebamed Bebek Güneş Spreyi (200 ml)",    alisFiyati:168.5, stok:12,desi:1,komisyon:0.04},
    {ad:"Dalin Islak Mendil 56'lı",               alisFiyati:28.9,  stok:60,desi:1,komisyon:0.028},
    {ad:"Nivea Baby Pişik Kremi (100 ml)",         alisFiyati:49.9,  stok:22,desi:1,komisyon:0.04},
    {ad:"Uni Baby Kolay Tarama Şampuanı (700 ml)", alisFiyati:89.5,  stok:15,desi:2,komisyon:0.04},
    {ad:"Dalin Bebek Kolonyası (150 ml)",          alisFiyati:77.5,  stok:40,desi:1,komisyon:0.038},
  ].forEach(u=>urunlerDB.ekle({...u,tip:'stok'}));
}

export const sync={bagliMi:false,async baslat(){},async uyarla(){}};

import('./supabase.js').then(({sb})=>{
  const _uE=urunlerDB.ekle.bind(urunlerDB),_uG=urunlerDB.guncelle.bind(urunlerDB),_uS=urunlerDB.sil.bind(urunlerDB);
  const _sE=satislarDB.ekle.bind(satislarDB),_sS=satislarDB.sil.bind(satislarDB);
  urunlerDB.ekle=(u)=>{const y=_uE(u);sb.urunEkle(y);return y;};
  urunlerDB.guncelle=(id,d)=>{_uG(id,d);sb.urunGuncelle(id,d);};
  urunlerDB.sil=(id)=>{_uS(id);sb.urunSil(id);};
  satislarDB.ekle=(ks)=>{const y=_sE(ks);sb.satisEkle(y);return y;};
  satislarDB.sil=(id)=>{_sS(id);sb.satisSil(id);};
}).catch(()=>{console.log('Offline mod');});
