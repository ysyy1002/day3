// Vercel Serverless Function: Gemini 에이전트가 find_spots / get_weather 를 스스로 골라 호출해 추천합니다.
// API 키는 Vercel 환경변수 GEMINI_API_KEY 에서 읽습니다. (Google AI Studio 에서 발급)
import { tools, handlers } from "./tools.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const URL = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
const MAX_STEPS = 6; // 도구 호출 반복 상한

// tools.js 의 도구 설명(name · description · input_schema)을 Gemini 형식으로 변환
const geminiTools = [
  {
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  },
];

const SYSTEM =
  "당신은 제주 여행 추천 도우미입니다. 사용자의 요청에 맞게 get_weather 와 find_spots 도구를 필요한 만큼 직접 호출하세요. " +
  "비·강풍이면 실내, 맑으면 야외 위주로 고르는 식으로 날씨를 반영하고, 지역이 모호하면 합리적으로 정해 알려주세요. " +
  "추천 장소는 반드시 find_spots 결과에 있는 것만 쓰고, 목록 밖 장소는 지어내지 마세요. " +
  "한국어로 짧고 친근하게 답하고, 왜 추천하는지 날씨 근거를 한 줄 덧붙이세요.";

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY 환경변수가 없습니다." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 로 요청하세요." });
  }

  const message = String((req.body && req.body.message) || "").trim().slice(0, 500);
  if (!message) {
    return res.status(400).json({ error: "message 가 필요합니다." });
  }

  const contents = [{ role: "user", parts: [{ text: message }] }];
  const steps = []; // 화면에 보여줄 도구 호출 기록
  let spots = [];   // 지도에 찍을 마지막 find_spots 결과

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const r = await fetch(URL, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          tools: geminiTools,
        }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return res.status(502).json({ error: "Gemini 요청 실패 (" + r.status + ") " + detail.slice(0, 200) });
      }
      const data = await r.json();
      const content = data.candidates && data.candidates[0] && data.candidates[0].content;
      if (!content || !content.parts) {
        return res.status(502).json({ error: "Gemini 응답이 비어 있습니다." });
      }
      contents.push(content); // 모델 응답을 그대로 이어 붙여야 함수 호출 맥락이 유지됨

      const calls = content.parts.filter(p => p.functionCall);
      if (calls.length === 0) {
        const reply = content.parts.map(p => p.text || "").join("");
        return res.status(200).json({ reply, steps, spots });
      }

      // 요청된 도구를 모두 실행해 결과를 돌려줌
      const results = [];
      for (const { functionCall: call } of calls) {
        const fn = handlers[call.name];
        const out = fn ? await fn(call.args || {}) : { error: "알 수 없는 도구: " + call.name };
        steps.push({ tool: call.name, input: call.args || {} });
        if (call.name === "find_spots" && out.spots) spots = out.spots;
        results.push({ functionResponse: { name: call.name, response: out } });
      }
      contents.push({ role: "user", parts: results });
    }
    return res.status(200).json({ reply: "도구 호출이 너무 길어져 중단했어요. 질문을 좀 더 구체적으로 해주세요.", steps, spots });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류: " + e.message });
  }
}
