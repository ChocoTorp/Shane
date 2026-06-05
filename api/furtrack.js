// Same-origin preview proxy for Furtrack posts (Vercel serverless function).
//
// Why this exists: the client used public CORS proxies (allorigins / corsproxy /
// codetabs) to read a post's Open Graph tags. Those work from localhost but get
// origin/referer-gated when the request comes from the deployed domain, so on
// Vercel the card showed "No preview available". Fetching server-side here has
// no CORS or mixed-content problem, so previews work in production.
//
// GET /api/furtrack?id=<numericId>  ->  { img, title, desc }

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').replace(/[^0-9]/g, '');
  if (!id) {
    res.status(400).json({ error: 'missing id' });
    return;
  }

  // fxfurtrack renders rich Open Graph tags (like fxtwitter does for x.com).
  const target = 'https://fxfurtrack.com/p/' + id;

  // Pull a <meta property|name="KEY" content="VALUE"> value, in either attr order.
  const meta = function (html, key) {
    const k = key.replace(/[:]/g, '\\$&');
    const a = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + k + '["\'][^>]*content=["\']([^"\']+)', 'i'));
    if (a) return a[1];
    const b = html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + k + '["\']', 'i'));
    return b ? b[1] : null;
  };

  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhiskrBot/1.0; +https://shane-alpha.vercel.app)',
        'Accept': 'text/html',
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: 'upstream ' + r.status });
      return;
    }
    const html = await r.text();
    let img = meta(html, 'og:image') || meta(html, 'twitter:image');
    const title = meta(html, 'og:title');
    const desc = meta(html, 'og:description');
    // Never hand back an http:// image to an https page (mixed content -> blocked).
    if (img && img.indexOf('http://') === 0) img = 'https://' + img.slice('http://'.length);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ img: img || null, title: title || null, desc: desc || null });
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
};
