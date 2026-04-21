// Trendyol API CORS proxy — Supabase Edge Function
// Deploy: supabase functions deploy trendyol-proxy

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
    const { sellerId, apiKey, apiSecret, startDate, endDate, page = 0, size = 200 } = await req.json();

    if (!sellerId || !apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'sellerId, apiKey, apiSecret zorunlu' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const params = new URLSearchParams({
      orderByField: 'PackageLastModifiedDate',
      orderByDirection: 'DESC',
      page: String(page),
      size: String(size),
    });
    if (startDate) params.set('startDate', String(startDate));
    if (endDate)   params.set('endDate',   String(endDate));

    const url = `https://apigw.trendyol.com/integration/order/sellers/${sellerId}/orders?${params}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'User-Agent': `${sellerId} - Self Integration`,
        'Content-Type': 'application/json',
      },
    });

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
