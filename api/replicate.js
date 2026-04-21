module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Missing required field: prompt' });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: '1:1',
          output_format: 'png',
          output_quality: 90,
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return res.status(createRes.status).json({ error: err.detail || `Replicate error ${createRes.status}` });
    }

    let prediction = await createRes.json();

    // Use Prefer: wait for synchronous long-poll on the GET URL
    if (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.urls?.get) {
      const pollRes = await fetch(prediction.urls.get, {
        headers: {
          'Authorization': `Token ${token}`,
          'Prefer': 'wait=50',
        },
      });
      if (pollRes.ok) {
        prediction = await pollRes.json();
      }
    }

    // Fallback manual polling if Prefer: wait wasn't honoured
    let attempts = 0;
    while (
      prediction.status !== 'succeeded' &&
      prediction.status !== 'failed' &&
      prediction.status !== 'canceled' &&
      attempts < 20
    ) {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${token}` },
      });
      if (!pollRes.ok) break;
      prediction = await pollRes.json();
      attempts++;
    }

    if (prediction.status !== 'succeeded') {
      return res.status(500).json({ error: prediction.error || 'Prediction did not succeed' });
    }

    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return res.status(200).json({ imageUrl });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Replicate call failed' });
  }
};
