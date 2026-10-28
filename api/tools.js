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

// Claude 에 넘길 도구 설명
export const tools = [
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
export const handlers = { find_spots };
