import { readFileSync } from "node:fs";

// jeju_spots.json 은 api/ 폴더의 한 단계 위(day3/)에 있습니다.
const { spots } = JSON.parse(
  readFileSync(new URL("../jeju_spots.json", import.meta.url), "utf-8")
);

const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];
const MAX_RESULTS = 8;

// 실제 도구: 데이터의 area 는 "동쪽(성산)" 처럼 읍면이 붙어 있으므로 앞부분(동쪽/서쪽/...)으로 맞춥니다.
export function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: "area 는 " + AREAS.join(" · ") + " 중 하나여야 합니다." };
  }
  const found = spots
    .filter(s => s.area === area || s.area.startsWith(area + "("))
    .filter(s => indoor === undefined || indoor === null || s.indoor === indoor);

  return {
    total: found.length,
    spots: found.slice(0, MAX_RESULTS).map(s => ({
      name: s.name,
      areas: [s.area],
      indoor: s.indoor,
      description: s.type, // 목록에는 별도 설명 대신 유형(type)만 있어 그것을 설명으로 씁니다.
    })),
  };
}

// 지역별 대표 좌표 (Open-Meteo 날씨 조회용)
const CENTER = {
  동쪽: [33.46, 126.88],
  서쪽: [33.36, 126.3],
  서귀포: [33.25, 126.56],
  제주시: [33.51, 126.52],
};

// Open-Meteo 날씨 코드 → 한글 (https://open-meteo.com/en/docs 의 WMO weather code)
const WEATHER = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개",
  51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비", 61: "약한 비", 63: "비", 65: "강한 비",
  71: "약한 눈", 73: "눈", 75: "강한 눈", 80: "약한 소나기", 81: "소나기", 82: "강한 소나기",
  95: "뇌우", 96: "뇌우(우박)", 99: "뇌우(우박)",
};

export async function get_weather({ area, days } = {}) {
  if (!CENTER[area]) {
    return { error: "area 는 " + AREAS.join(" · ") + " 중 하나여야 합니다." };
  }
  const n = Math.min(7, Math.max(1, parseInt(days, 10) || 3));
  const [latitude, longitude] = CENTER[area];
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone: "Asia/Seoul",
    forecast_days: n,
  });
  const r = await fetch("https://api.open-meteo.com/v1/forecast?" + params);
  if (!r.ok) return { error: "날씨 조회 실패 (" + r.status + ")" };
  const d = await r.json();
  return {
    area,
    now: {
      weather: WEATHER[d.current.weather_code] || "알 수 없음",
      temp_c: d.current.temperature_2m,
      precipitation_mm: d.current.precipitation,
      wind_kmh: d.current.wind_speed_10m,
    },
    daily: d.daily.time.map((date, i) => ({
      date,
      weather: WEATHER[d.daily.weather_code[i]] || "알 수 없음",
      temp_min_c: d.daily.temperature_2m_min[i],
      temp_max_c: d.daily.temperature_2m_max[i],
      rain_chance_pct: d.daily.precipitation_probability_max[i],
      rain_mm: d.daily.precipitation_sum[i],
    })),
  };
}

// 모델에 넘길 도구 설명 (name · description · input_schema — chat.js 에서 Gemini 형식으로 변환)
export const tools = [
  {
    name: "get_weather",
    description:
      "Open-Meteo 로 제주 지역(동쪽·서쪽·서귀포·제주시)의 현재 날씨와 며칠간 예보(기온·강수확률·강수량)를 조회합니다. " +
      "비가 오는지 등 날씨에 따라 실내/야외 추천이 달라질 때 호출하세요.",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string", enum: AREAS, description: "날씨를 볼 지역" },
        days: { type: "integer", minimum: 1, maximum: 7, description: "예보 일수 (기본 3)" },
      },
      required: ["area"],
    },
  },
  {
    name: "find_spots",
    description:
      "제주도 관광지 목록(jeju_spots.json)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 " +
      "이름·지역·실내 여부·설명을 돌려줍니다. 목록 밖 장소는 없습니다. " +
      "결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 없으면 없다고 답하세요.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "찾을 지역",
        },
        indoor: {
          type: "boolean",
          description: "true 면 실내만, false 면 야외만. 생략하면 구분하지 않음",
        },
      },
      required: ["area"],
    },
  },
];

// 도구 이름 → 실행 함수
export const handlers = { find_spots, get_weather };
