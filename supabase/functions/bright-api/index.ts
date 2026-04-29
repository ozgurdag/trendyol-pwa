// @ts-nocheck
// Trendyol API CORS proxy — Supabase Edge Function
// Deploy: supabase functions deploy bright-api --no-verify-jwt

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
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
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const basicHeaders = {
      'Authorization': `Basic ${credentials}`,
      'User-Agent': `${sellerId} - Self Integration`,
      'Content-Type': 'application/json',
    };

    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (body.startDate) params.set('startDate', String(body.startDate));
    if (body.endDate)   params.set('endDate',   String(body.endDate));

    let url = '';

    if (type === 'orders') {
      if (body.status) params.set('status', body.status);
      url = `https://apigw.trendyol.com/integration/order/sellers/${sellerId}/orders?${params}`;

    } else if (type === 'settlements') {
      if (body.transactionType) params.set('transactionType', body.transactionType);

      // Birden fazla URL dene (CHE ve klasik)
      const urls = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/settlements?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/settlements?${params}`,
      ];
      for (const u of urls) {
        const r = await fetch(u, { headers: basicHeaders });
        const text = await r.text();
        if (r.ok) return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Settlements API başarısız' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'otherfinancials') {
      if (body.transactionType)    params.set('transactionType',    body.transactionType);
      if (body.transactionSubType) params.set('transactionSubType', body.transactionSubType);

      const urls = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/otherfinancials?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/otherfinancials?${params}`,
      ];
      for (const u of urls) {
        const r = await fetch(u, { headers: basicHeaders });
        const text = await r.text();
        if (r.ok) return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Otherfinancials API başarısız' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'cargo-invoice') {
      if (!body.invoiceSerialNumber) {
        return new Response(JSON.stringify({ error: 'invoiceSerialNumber zorunlu' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const urls = [
        `https://apigw.trendyol.com/integration/finance/che/sellers/${sellerId}/cargo-invoice/${body.invoiceSerialNumber}/items?${params}`,
        `https://apigw.trendyol.com/integration/finance/sellers/${sellerId}/cargo-invoice/${body.invoiceSerialNumber}/items?${params}`,
      ];
      for (const u of urls) {
        const r = await fetch(u, { headers: basicHeaders });
        const text = await r.text();
        if (r.ok) return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Cargo invoice API başarısız' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });

    } else if (type === 'products') {
      if (body.barcode)           params.set('barcode',   body.barcode);
      if (body.approved != null)  params.set('approved',  String(body.approved));
      url = `https://apigw.trendyol.com/integration/product/sellers/${sellerId}/products?${params}`;

    } else {
      return new Response(JSON.stringify({ error: `Bilinmeyen type: ${type}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, { headers: basicHeaders });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }

    if (!res.ok) {
      console.error(`[proxy] ${type} ${res.status} — ${url.split('?')[0]} — ${text.slice(0, 300)}`);
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
