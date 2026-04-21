module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, negativePrompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Missing required field: prompt' });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Missing environment variable: REPLICATE_API_TOKEN' });
  }

  try {
    const createRes = await fetch('https://api.replicate.com/v1/models/recraft-ai/recraft-v3/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt,
          negative_prompt: negativePrompt || '',
          style: 'vector_illustration',
          width: 1024,
          height: 1024,
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return res.status(createRes.status).json({ error: err.detail || `Replicate error ${createRes.status}` });
    }

    let prediction = await createRes.json();

    // Long-poll the GET URL — Replicate holds the connection until done
    if (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.urls?.get) {
      const pollRes = await fetch(prediction.urls.get, {
        headers: {
          'Authorization': `Token ${token}`,
          'Prefer': 'wait=25',
        },
      });
      if (pollRes.ok) {
        prediction = await pollRes.json();
      }
    }

    // Fallback: manual polling at 2s intervals, max 10 attempts (~20s)
    let attempts = 0;
    while (
      prediction.status !== 'succeeded' &&
      prediction.status !== 'failed' &&
      prediction.status !== 'canceled' &&
      attempts < 10
    ) {
      await new Promise(r => setTimeout(r, 2000));
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
