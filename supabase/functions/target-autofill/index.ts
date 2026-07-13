import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["displayName", "subtitle", "catalogNames", "objectType", "constellation", "distance", "rightAscensionHours", "rightAscensionDisplay", "declinationDegrees", "declinationDisplay", "magnitude", "angularSize", "notes", "confidence", "caution"],
  properties: {
    displayName: { type: "string" },
    subtitle: { type: "string" },
    catalogNames: { type: "array", items: { type: "string" } },
    objectType: { type: "string" },
    constellation: { type: "string" },
    distance: { type: "string" },
    rightAscensionHours: { type: ["number", "null"] },
    rightAscensionDisplay: { type: "string" },
    declinationDegrees: { type: ["number", "null"] },
    declinationDisplay: { type: "string" },
    magnitude: { type: ["number", "null"] },
    angularSize: { type: "string" },
    notes: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    caution: { type: "string" }
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Crew authentication required.");

    const { target, existingValues = {} } = await req.json();
    if (!String(target || "").trim()) throw new Error("A target name is required.");

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured.");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_TARGET_MODEL") || "gpt-5-mini",
        instructions: "You are an astronomy catalog assistant for an astrophotography archive. Identify the requested celestial target. Return conservative, concise catalog metadata. Use decimal hours for rightAscensionHours and signed decimal degrees for declinationDegrees. Distances should be human-readable and include approximate wording where measurements vary. Never invent a match; use low confidence and explain ambiguity in caution. Notes should be 1-2 factual sentences suitable for a public mission archive. Do not provide imaging recommendations in this response.",
        input: JSON.stringify({ target, existingValues }),
        tools: [{ type: "web_search_preview" }],
        text: {
          format: {
            type: "json_schema",
            name: "target_metadata",
            strict: true,
            schema
          }
        }
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "OpenAI target lookup failed.");

    const outputText = result.output_text || result.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("OpenAI returned no structured target data.");

    return new Response(JSON.stringify({ target: JSON.parse(outputText), generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Target lookup failed." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
