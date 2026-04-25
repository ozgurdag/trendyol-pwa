// @ts-nocheck
// Trendyol API CORS proxy — Supabase Edge Function
// Deploy: supabase functions deploy trendyol-proxy  (slug: bright-api)
// Supports type: "orders" | "settlements" | "otherfinancials" | "cargo-invoice" | "products"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json();
    const { sellerId, apiKey, apiSecret, type = 'orders', page = 0, size = 200 } = body;

    if (!sellerId || !apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'sellerId, apiKey, apiSecret zorunlu' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const basicHeaders = {
      'Authorization': `Basic ${credentials}`,
      'User-Agent': `${sellerId} - Self Integration`,
      'Content-Type': 'application/json',
    };

    let url: string;

    if (type === 'orders') {
      const { startDate, endDate, status } = body;
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
      });
      // startDate/endDate → TY API'de lastModifiedDate filtresi olarak çalışır
      if (startDate) params.set('startDate', String(startDate));
      if (endDate)   params.set('endDate',   String(endDate));
      if (status)    params.set('status',    status);
      url = `https://apigw.trendyol.com/integration/order/sellers/${sellerId}/orders?${params}`;

    } else if (type === 'settlements') {
      const { startDate, endDate, transactionType, token } = body;
      const params = new URLSearchParams({ page: String(page), size: String(size) });
      if (startDate)       params.set('startDate',       String(startDate));
      if (endDate)         params.set('endDate',         String(endDate));
      if (transactionType) params.set('transactionType', transactionType);

      // Finance API için Bearer token + birden fazla URL dene
      const bearerHeaders = token ? {
        'Authorization': `Bearer ${token}`,
        'User-Agent': `${sellerId} - Self Integration`,
        'Content-Type': 'application/json',
      } : null;

      const urlCandidates = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/settlements?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/settlements?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/otherfinancials/settlements?${params}`,
      ];

      let lastError = 'Başarısız';
      for (const candidate of urlCandidates) {
        const attempts = bearerHeaders ? [bearerHeaders, basicHeaders] : [basicHeaders];
        for (const hdrs of attempts) {
          const r = await fetch(candidate, { headers: hdrs });
          const t2 = await r.text();
          if (r.ok) {
            return new Response(t2, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
          }
          lastError = `URL: ${candidate.split('?')[0]} | Status: ${r.status} | Msg: ${t2.slice(0, 200)}`;
        }
      }
      return new Response(JSON.stringify({ error: 'Finance API başarısız', detail: lastError }), {
        status: 556,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'otherfinancials') {
      const { startDate, endDate, transactionType, transactionSubType } = body;
      const params = new URLSearchParams({ page: String(page), size: String(size) });
      if (startDate)          params.set('startDate',          String(startDate));
      if (endDate)            params.set('endDate',            String(endDate));
      if (transactionType)    params.set('transactionType',    transactionType);
      if (transactionSubType) params.set('transactionSubType', transactionSubType);

      const urlCandidates = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/otherfinancials?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/otherfinancials?${params}`,
      ];

      let lastError = 'Başarısız';
      for (const candidate of urlCandidates) {
        const attempts = bearerHeaders ? [bearerHeaders, basicHeaders] : [basicHeaders];
        for (const hdrs of attempts) {
          const r = await fetch(candidate, { headers: hdrs });
          const t2 = await r.text();
          if (r.ok) {
            return new Response(t2, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
          }
          lastError = `URL: ${candidate.split('?')[0]} | Status: ${r.status} | Msg: ${t2.slice(0, 200)}`;
        }
      }
      return new Response(JSON.stringify({ error: 'Finance API otherfinancials başarısız', detail: lastError }), {
        status: 557,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'cargo-invoice') {
      const { invoiceSerialNumber } = body;
      if (!invoiceSerialNumber) {
        return new Response(JSON.stringify({ error: 'invoiceSerialNumber zorunlu' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const params = new URLSearchParams({ page: String(page), size: String(size) });
      const urlCandidates = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/cargo-invoice/${invoiceSerialNumber}/items?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/cargo-invoice/${invoiceSerialNumber}/items?${params}`,
      ];

      let lastError = 'Başarısız';
      for (const candidate of urlCandidates) {
        const attempts = bearerHeaders ? [bearerHeaders, basicHeaders] : [basicHeaders];
        for (const hdrs of attempts) {
          const r = await fetch(candidate, { headers: hdrs });
          const t2 = await r.text();
          if (r.ok) {
            return new Response(t2, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
          }
          lastError = `URL: ${candidate.split('?')[0]} | Status: ${r.status} | Msg: ${t2.slice(0, 200)}`;
        }
      }
      return new Response(JSON.stringify({ error: 'Cargo invoice API başarısız', detail: lastError }), {
        status: 558,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'products') {
      const { barcode, approved, page: p = 0 } = body;
      const params = new URLSearchParams({
        page: String(p),
        size: String(size),
      });
      if (barcode)            params.set('barcode',  barcode);
      if (approved != null)   params.set('approved', String(approved));
      url = `https://apigw.trendyol.com/integration/product/sellers/${sellerId}/products?${params}`;

    } else {
      return new Response(JSON.stringify({ error: `Bilinmeyen type: ${type}` }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, { headers: basicHeaders });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }

    if (!res.ok) {
      console.error(`[proxy] ${type} ${res.status} — url: ${url} — body: ${text.slice(0,300)}`);
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
