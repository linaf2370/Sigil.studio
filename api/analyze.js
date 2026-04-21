module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { images } = req.body || {};

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing required field: images' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing environment variable: ANTHROPIC_API_KEY' });
  }

  const content = [
    ...images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    {
      type: 'text',
      text: 'Analyze these moodboard images for a brand identity project. Extract and describe: (1) COLOR TEMPERATURE: warm/cool/neutral, specific palette notes; (2) VISUAL WEIGHT: heavy/airy/balanced; (3) ERA REFERENCE: any historical movement or period reference; (4) EMOTIONAL REGISTER: 3–5 words. Be terse and specific. Format exactly as: COLOR TEMPERATURE: ... | VISUAL WEIGHT: ... | ERA REFERENCE: ... | EMOTIONAL REGISTER: ...',
    },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json({ analysis: data.content[0].text.trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Analysis failed' });
  }
};
