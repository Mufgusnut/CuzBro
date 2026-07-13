const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const recommendationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'exposureSeconds',
    'frameCount',
    'gain',
    'totalIntegrationSeconds',
    'equipment',
    'rationale',
    'adjustments',
    'targetAssessment',
    'dewAdvisory'
  ],
  properties: {
    exposureSeconds: { type: 'number', minimum: 0.001, maximum: 60 },
    frameCount: { type: 'integer', minimum: 1, maximum: 20000 },
    gain: { type: 'integer', minimum: 0, maximum: 600 },
    totalIntegrationSeconds: { type: 'number', minimum: 0.001, maximum: 200000 },
    equipment: { type: 'string', minLength: 3, maxLength: 240 },
    rationale: { type: 'string', minLength: 20, maxLength: 700 },
    adjustments: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', minLength: 3, maxLength: 220 }
    },
    targetAssessment: { type: 'string', minLength: 10, maxLength: 500 },
    dewAdvisory: { type: 'string', minLength: 10, maxLength: 400 }
  }
};

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for this Edge Function.');

    const context = await req.json();
    const targetName = context?.target?.title || 'the selected target';

    const systemPrompt = `You are the CuzBro Observatory mission-planning specialist. Produce a conservative astrophotography recommendation using only the supplied live console data. The rig is a Celestron CPC 800 alt-az fork mount with no wedge and a ZWO ASI294MC one-shot-color camera. Favor short sub-exposures to limit field rotation. Never claim weather, moon, visibility, or sensor facts that are absent from the input. Treat the deterministic baseline as a useful sanity check, but improve it when current altitude, weather, dew telemetry, mount state, or field history supports a change. Keep the language operational, direct, and safe. Do not recommend a slew when the target is below the horizon. The numeric totalIntegrationSeconds must equal exposureSeconds multiplied by frameCount.`;

    const userPrompt = `Generate a fresh mission recommendation for ${targetName}. Current console context follows:\n${JSON.stringify(context, null, 2)}`;

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'mission_recommendation',
            strict: true,
            schema: recommendationSchema
          }
        }
      })
    });

    const payload = await openAiResponse.json();
    if (!openAiResponse.ok) {
      const message = payload?.error?.message || `OpenAI HTTP ${openAiResponse.status}`;
      throw new Error(message);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error('OpenAI returned no structured recommendation text.');

    const recommendation = JSON.parse(outputText);
    recommendation.totalIntegrationSeconds = Number(recommendation.exposureSeconds) * Number(recommendation.frameCount);

    return new Response(JSON.stringify({
      recommendation,
      generatedAt: new Date().toISOString(),
      model
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[mission-recommendation]', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Recommendation generation failed.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
