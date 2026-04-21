// @ts-nocheck
// Trendyol API CORS proxy — Supabase Edge Function
// Deploy: supabase functions deploy trendyol-proxy  (slug: bright-api)
// Supports type: "orders" | "settlements" | "products"

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
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'User-Agent': `${sellerId} - Self Integration`,
      'Content-Type': 'application/json',
    };

    let url: string;

    if (type === 'orders') {
      const { startDate, endDate } = body;
      const params = new URLSearchParams({
        orderByField: 'PackageLastModifiedDate',
        orderByDirection: 'DESC',
        page: String(page),
        size: String(size),
      });
      if (startDate) params.set('startDate', String(startDate));
      if (endDate)   params.set('endDate',   String(endDate));
      url = `https://apigw.trendyol.com/integration/order/sellers/${sellerId}/orders?${params}`;

    } else if (type === 'settlements') {
      const { startDate, endDate, transactionType } = body;
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
      });
      if (startDate)       params.set('startDate',       String(startDate));
      if (endDate)         params.set('endDate',         String(endDate));
      if (transactionType) params.set('transactionType', transactionType);
      url = `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/settlements?${params}`;

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

    const res = await fetch(url, { headers });
    const data = await res.json();

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
