// SQL 검색기 워크플로우 설계서 PPT 빌드 스크립트
// 근거: ../sql_retriever_워크플로우설계서.md (슬라이드 스크립트), references/pptx-guide.md (6절 코드 규칙)
// 실행: NODE_PATH=$(npm root -g) node build_deck.js
//   → ../sql_retriever_워크플로우설계서.pptx, ./flow_edges.json(도식 화살표 목록, 계산 검증 대조용)

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const OUT_PPTX = path.resolve(__dirname, "..", "sql_retriever_워크플로우설계서.pptx");
const OUT_EDGES = path.resolve(__dirname, "flow_edges.json");

// ---------------------------------------------------------------------------
// 6-1 팔레트, 6-2 최소 글자 크기, 6-10 글꼴
// ---------------------------------------------------------------------------
const C = {
  title: "2C2926", lead: "000000",
  navy: "1E2A5C", blue: "2E74C6", ink: "2B3242",
  slate: "4A5364", sub: "7C8598", body: "3B4557",
  tint: "EEF3FA", altRow: "F5F8FC", tableHead: "E2EEF9",
  dark: "404155", border: "D9E0EC", line: "EDF0F6",
  titleLine: "E2E8F0", footLine: "E9ECF3", pageNum: "6B6B7B",
  pillLine: "C3CEE0", white: "FFFFFF",
};
const FONT = "Pretendard";
const FONT_SB = "Pretendard SemiBold";
const MIN_FONT = 14;
const fsMin = (size) => {
  if (size < MIN_FONT) throw new Error(`fontSize ${size} < ${MIN_FONT}pt 금지! 슬라이드를 분리할 것`);
  return size;
};

// ---------------------------------------------------------------------------
// 6-5 레이아웃 상수
// ---------------------------------------------------------------------------
const LAYOUT = "내용_단쪽";
const X0 = 0.557, CW = 14.9, XR = X0 + CW;
const BODY_TOP = 1.90, BODY_BOTTOM = 7.95;
const GAP = 0.25;
const HALF = (CW - GAP) / 2;

let pptx;

// ---------------------------------------------------------------------------
// 글자 폭 추정 — 표 행 높이를 미리 계산해 넘침을 빌드 단계에서 잡기 위함
// (PowerPoint와 LibreOffice는 넘치는 표 행을 자동으로 늘리므로, 추정 높이로 바닥선을 검사함)
// ---------------------------------------------------------------------------
function charEm(ch) {
  if (/[ㄱ-힝]/.test(ch)) return 0.96;
  if (ch === " ") return 0.28;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[a-z]/.test(ch)) return 0.53;
  if (/[_\-]/.test(ch)) return 0.5;
  if (/[()[\]{}.,:;'`|/]/.test(ch)) return 0.34;
  return 0.7;
}
function textWidthIn(str, pt) {
  let em = 0;
  for (const ch of str) em += charEm(ch);
  return (em * pt) / 72;
}
function lineCount(str, widthIn, pt) {
  return String(str).split("\n").reduce((n, para) =>
    n + Math.max(1, Math.ceil((textWidthIn(para, pt) * 1.06) / Math.max(widthIn, 0.1))), 0);
}
const lineH = (pt) => (pt * 1.22) / 72;

function guardBottom(label, bottom, limit = BODY_BOTTOM) {
  if (bottom > limit + 1e-6) throw new Error(`[넘침] ${label}: 바닥 ${bottom.toFixed(2)}″ > ${limit}″`);
}

// ---------------------------------------------------------------------------
// 6-5 레이아웃 정의와 헤더
// ---------------------------------------------------------------------------
function defineContentLayout(p) {
  p.defineSlideMaster({
    title: LAYOUT,
    background: { color: C.white },
    objects: [
      { line: { x: 0.556, y: 0.95, w: 14.888, h: 0, line: { color: C.titleLine, width: 1.5 } } },
      { text: { text: "무단전재 및 배포 금지",
          options: { x: 0.4875, y: 8.517, w: 1.675, h: 0.27, fontFace: FONT, fontSize: 12, color: "A6A6A6", margin: 0 } } },
      { placeholder: { options: { name: "title", type: "title", x: X0, y: 0.109, w: 15.025, h: 0.906,
          fontFace: FONT, fontSize: 32, bold: true, color: C.title, margin: 0, align: "left", valign: "middle" },
          text: "" } },
    ],
    slideNumber: { x: 11.913, y: 8.517, w: 3.6, h: 0.25, fontFace: FONT, fontSize: 16, color: C.pageNum, align: "right" },
  });
}

function newSlide(title, lead) {
  const slide = pptx.addSlide({ masterName: LAYOUT });
  slide.addText(title, { placeholder: "title" });
  if (lead) {
    if (textWidthIn(lead, 18) > CW) throw new Error(`[넘침] 리드문 한 줄 초과: ${lead}`);
    slide.addText(lead, { x: X0, y: 1.259, w: CW, h: 0.42, margin: 0, isTextBox: true,
      fontFace: FONT_SB, fontSize: fsMin(18), color: C.lead });
  }
  return slide;
}

function sourceLine(slide, text) {
  slide.addShape(pptx.shapes.LINE, { x: X0, y: 8.08, w: CW, h: 0, line: { color: C.footLine, width: 1 } });
  slide.addText(text, { x: X0, y: 8.14, w: CW, h: 0.42, margin: 0, valign: "top", isTextBox: true,
    fontFace: FONT, fontSize: text.length > 140 ? 12 : 14, color: C.sub });
}

// ---------------------------------------------------------------------------
// 6-3, 6-4 컴포넌트
// ---------------------------------------------------------------------------
function headerBar(slide, { x, y, w, text, accent = false }) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.5, rectRadius: 0.06,
    fill: { color: accent ? C.blue : C.navy }, line: { type: "none" } });
  slide.addText(text, { x, y, w, h: 0.5, align: "center", valign: "middle", color: C.white,
    bold: true, fontSize: fsMin(24), fontFace: FONT, margin: 0 });
  return y + 0.5;
}

function darkBadge(slide, { x, y, w, text }) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.4, rectRadius: 0.05,
    fill: { color: C.dark }, line: { type: "none" } });
  slide.addText(text, { x, y, w, h: 0.4, align: "center", valign: "middle", color: C.white,
    bold: true, fontSize: fsMin(16), fontFace: FONT, margin: 0 });
  return y + 0.4;
}

function numBadge(slide, { x, y, n, color = C.blue, size = 0.38 }) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w: size, h: size, rectRadius: 0.05,
    fill: { color }, line: { type: "none" } });
  slide.addText(String(n), { x, y, w: size, h: size, align: "center", valign: "middle",
    color: C.white, bold: true, fontSize: fsMin(16), fontFace: FONT, margin: 0 });
}

// 틴트 박스 + 번호 또는 글머리 목록 — 항목 높이 추정
function listMeasure({ w, items, numbered = true, size, title }) {
  const innerW = w - 0.3 - (numbered ? 0.5 : 0.25);
  const heights = items.map((t) => lineCount(t, innerW, size) * lineH(size) + 0.14);
  const need = 0.15 + (title ? 0.45 : 0) + heights.reduce((a, b) => a + b, 0) + 0.1;
  return { innerW, heights, need };
}

// fit: { bottom, maxSize } → 가장 큰 글자 크기를 고르고, 남는 높이는 항목 사이 간격으로 나눔(하단 여백 1인치 미만 유지)
function listBox(slide, { x, y, w, h, title, items, numbered = true, size = 16, fill = C.tint, label = "목록", fit, gapExtra = 0 }) {
  if (fit) {
    for (let s = fit.maxSize; s >= MIN_FONT; s--) {
      size = s;
      if (y + listMeasure({ w, items, numbered, size: s, title }).need <= fit.bottom) break;
    }
    const m0 = listMeasure({ w, items, numbered, size, title });
    gapExtra = Math.max(0, Math.min(0.35, (fit.bottom - y - m0.need) / items.length));
  }
  const m = listMeasure({ w, items, numbered, size, title });
  const need = m.need + gapExtra * items.length;
  const boxH = h || need;
  guardBottom(`${label} 목록 상자`, y + boxH);
  if (need > boxH + 1e-6) throw new Error(`[넘침] ${label}: 내용 ${need.toFixed(2)}″ > 상자 ${boxH.toFixed(2)}″`);
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w, h: boxH, rectRadius: 0.1,
    fill: { color: fill }, line: { color: C.border, width: 1 } });
  let cy = y + 0.15 + gapExtra / 2;
  if (title) {
    slide.addText(title, { x: x + 0.15, y: cy, w: w - 0.3, h: 0.4, margin: 0, bold: true,
      fontFace: FONT, fontSize: fsMin(Math.max(18, size)), color: C.navy });
    cy += 0.45;
  }
  items.forEach((t, i) => {
    const ih = m.heights[i];
    if (numbered) {
      numBadge(slide, { x: x + 0.15, y: cy + 0.03, n: i + 1, size: 0.34 });
      slide.addText(t, { x: x + 0.62, y: cy, w: m.innerW, h: ih - 0.04, margin: 0, valign: "top",
        fontFace: FONT, fontSize: fsMin(size), color: C.body });
    } else {
      slide.addText(t, { x: x + 0.18, y: cy, w: m.innerW + 0.07, h: ih - 0.04, margin: 0, valign: "top",
        fontFace: FONT, fontSize: fsMin(size), color: C.body, bullet: { indent: 14 } });
    }
    cy += ih + gapExtra;
  });
  return y + boxH;
}

// 표 행 높이 추정
function tableMeasure({ w, colW, header, rows, size, minRowH = 0.36 }) {
  const sum = colW.reduce((a, b) => a + b, 0);
  const cols = colW.map((c) => (c * w) / sum);
  const all = header ? [header, ...rows] : rows;
  const rowH = all.map((cells) => Math.max(minRowH, ...cells.map((t, i) =>
    lineCount(t, cols[i] - 0.16, size) * lineH(size) + 0.1)));
  return { cols, all, rowH, total: rowH.reduce((a, b) => a + b, 0) };
}

// 6-9 표: 헤더행 #E2EEF9, 짝수행 #F5F8FC. 행 높이는 추정값으로 정해 바닥선을 검사함
// fit: { bottom, maxSize } → 가장 큰 글자 크기를 고르고 남는 높이는 행마다 나눔
function dataTable(slide, { x, y, w, colW, header, rows, size = 14, label = "표", minRowH = 0.36, boldFirstCol = false,
  fit, rowAdd = 0 }) {
  if (fit) {
    for (let s = fit.maxSize; s >= MIN_FONT; s--) {
      size = s;
      if (y + tableMeasure({ w, colW, header, rows, size: s, minRowH }).total <= fit.bottom) break;
    }
    const m0 = tableMeasure({ w, colW, header, rows, size, minRowH });
    rowAdd = Math.max(0, Math.min(fit.maxAdd ?? 0.3, (fit.bottom - y - m0.total) / m0.rowH.length));
  }
  const m = tableMeasure({ w, colW, header, rows, size, minRowH });
  const rowH = m.rowH.map((h) => h + rowAdd);
  const total = rowH.reduce((a, b) => a + b, 0);
  guardBottom(label, y + total);
  const margin = [0.04, 0.08, 0.04, 0.08];
  const body = m.all.map((cells, r) => cells.map((t, c) => {
    const isHead = header && r === 0;
    const even = (header ? r : r + 1) % 2 === 0;
    return { text: String(t), options: {
      fill: { color: isHead ? C.tableHead : even ? C.altRow : C.white },
      color: isHead ? C.navy : C.body, bold: isHead || (boldFirstCol && c === 0),
      fontFace: FONT, fontSize: fsMin(size), valign: "middle", margin,
    } };
  }));
  slide.addTable(body, { x, y, w, colW: m.cols, rowH, fontFace: FONT, fontSize: fsMin(size),
    border: { type: "solid", color: C.border, pt: 0.75 }, autoPage: false });
  return y + total;
}

// 고정폭이 아닌 Pretendard로 적은 코드 상자(가이드 글꼴 규칙 우선)
function codeBox(slide, { x, y, w, h, lines, size = 14, label = "코드" }) {
  const need = lines.length * lineH(size) + 0.3;
  guardBottom(label, y + (h || need));
  if (h && need > h + 1e-6) throw new Error(`[넘침] ${label}: ${need.toFixed(2)}″ > ${h}″`);
  lines.forEach((l) => {
    if (textWidthIn(l, size) > w - 0.3) throw new Error(`[넘침] ${label} 줄 폭 초과: ${l}`);
  });
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w, h: h || need, rectRadius: 0.08,
    fill: { color: C.altRow }, line: { color: C.border, width: 1 } });
  slide.addText(lines.join("\n"), { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: (h || need) - 0.24, margin: 0,
    valign: "top", fontFace: FONT, fontSize: fsMin(size), color: C.ink, lineSpacingMultiple: 1.0 });
  return y + (h || need);
}

function caption(slide, { x = X0, y, w = CW, text, size = 14, color = C.slate }) {
  const h = lineCount(text, w, size) * lineH(size) + 0.06;
  guardBottom(`캡션 ${text.slice(0, 12)}`, y + h);
  slide.addText(text, { x, y, w, h, margin: 0, valign: "top", fontFace: FONT, fontSize: fsMin(size), color });
  return y + h;
}

// 2단 헤더 바(패턴 A): 양쪽 같은 글자 크기를 고르고, 두 상자를 같은 높이로 맞춤
function twoColumns(slide, { left, right, y = BODY_TOP, size = 18, bottom = BODY_BOTTOM }) {
  const top = y + 0.5 + 0.12;
  const nl = left.numbered !== false, nr = right.numbered !== false;
  let s = size;
  for (; s > MIN_FONT; s--) {
    const a = listMeasure({ w: HALF, items: left.items, numbered: nl, size: s }).need;
    const b = listMeasure({ w: HALF, items: right.items, numbered: nr, size: s }).need;
    if (top + Math.max(a, b) <= bottom) break;
  }
  const mL = listMeasure({ w: HALF, items: left.items, numbered: nl, size: s });
  const mR = listMeasure({ w: HALF, items: right.items, numbered: nr, size: s });
  const room = bottom - top;
  const gL = Math.max(0, Math.min(0.35, (room - mL.need) / left.items.length));
  const gR = Math.max(0, Math.min(0.35, (room - mR.need) / right.items.length));
  const boxH = Math.max(mL.need + gL * left.items.length, mR.need + gR * right.items.length);
  headerBar(slide, { x: X0, y, w: HALF, text: left.title });
  headerBar(slide, { x: X0 + HALF + GAP, y, w: HALF, text: right.title, accent: true });
  listBox(slide, { x: X0, y: top, w: HALF, h: boxH, items: left.items, numbered: nl, size: s, gapExtra: gL, label: left.title });
  listBox(slide, { x: X0 + HALF + GAP, y: top, w: HALF, h: boxH, items: right.items, numbered: nr, size: s, gapExtra: gR,
    fill: C.altRow, label: right.title });
  return top + boxH;
}

// 선(화살표). 가로선과 세로선만 씀
function seg(slide, x1, y1, x2, y2, { arrow = false, dash = false, color = C.navy } = {}) {
  const opts = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    line: { color, width: 1.75, dashType: dash ? "dash" : "solid", endArrowType: arrow ? "triangle" : undefined } };
  if (x2 < x1) opts.flipH = true;
  if (y2 < y1) opts.flipV = true;
  slide.addShape(pptx.shapes.LINE, opts);
}

// ---------------------------------------------------------------------------
// 슬라이드 1 ~ 4: 제목, 개요, 용어, 목차
// ---------------------------------------------------------------------------
async function createSlide01() {
  const slide = pptx.addSlide({ masterName: LAYOUT });
  slide.addText("SQL 검색기 워크플로우 설계서", { placeholder: "title" });
  slide.addText("W-1  SQL 검색기", { x: X0, y: 2.3, w: CW, h: 0.8, margin: 0, fontFace: FONT, fontSize: fsMin(36),
    bold: true, color: C.navy });
  slide.addShape(pptx.shapes.RECTANGLE, { x: X0, y: 3.5, w: 0.08, h: 1.4, fill: { color: C.blue }, line: { type: "none" } });
  slide.addText("상담사 질문을 정해 둔 조회(정형쿼리) 또는 LLM이 만든 SQL(NL2SQL)로 바꿔,\n"
    + "회원 범위 안에서만 안전하게 답을 찾음", { x: X0 + 0.3, y: 3.5, w: CW - 0.3, h: 1.4, margin: 0,
    fontFace: FONT, fontSize: fsMin(28), color: C.ink, valign: "middle" });
  const cards = [["워크플로우", "W-1 SQL 검색기"], ["팀명", "design-agentic-ai"], ["작성일", "2026-10-15"]];
  const cw = (CW - GAP * 2) / 3;
  cards.forEach(([k, v], i) => {
    const x = X0 + i * (cw + GAP);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y: 5.6, w: cw, h: 2.0, rectRadius: 0.1,
      fill: { color: C.tint }, line: { color: C.border, width: 1 } });
    slide.addText(k, { x: x + 0.3, y: 5.85, w: cw - 0.6, h: 0.5, margin: 0, fontFace: FONT, fontSize: fsMin(18),
      bold: true, color: C.navy });
    slide.addText(v, { x: x + 0.3, y: 6.5, w: cw - 0.6, h: 0.7, margin: 0, fontFace: FONT, fontSize: fsMin(28),
      color: C.ink });
  });
}

async function createSlide02() {
  const slide = newSlide("설계 개요", "정형 DB에서 답을 찾는 동기 요청 1건을 15초 안에 끝내는 워크플로우를 설계함");
  twoColumns(slide, {
    left: { title: "설계 대상과 범위", numbered: false, items: [
      "설계 대상: SQL 검색기 워크플로우 W-1(단계 6개, 반복 구간 1개, 커넥터 1개)",
      "관련 유저스토리: 없음",
      "시작 트리거: 동기 요청(호출자가 검색을 요청하고 응답을 기다림) → 단계ID 접두어 S-R",
      "설계 범위: 요청 검증, 정형쿼리 또는 NL2SQL 판단, 계획 판정, SQL 검증, SQL 실행, 응답 반환",
      "제외 범위: 답변 문장 생성(호출자 몫), 비정형 문서 검색(RAG), DB 스키마와 뷰 변경",
    ] },
    right: { title: "설계 기준", items: [
      "DB 취급: 시스템 내부 구성요소. 외부시스템 연동 명세와 커넥터 목록에 넣지 않음",
      "전체 시간 예산: 15초(종료 처리 시간 1초)",
      "필드 표기 방식: 이름(타입, 필수 여부, 설명). 타입은 string, integer, boolean, date(YYYY-MM-DD), datetime, object, array",
      "DB 계정: NL2SQL 실행 계정 sql_retriever_user(관리자 권한 없음, 읽기 전용 세션)",
    ] },
  });
}

async function createSlide03() {
  const slide = newSlide("처음 보는 분을 위한 용어 풀이", "설계서에 자주 나오는 용어를 한 줄로 풀어 둠");
  const y = darkBadge(slide, { x: X0, y: BODY_TOP, w: 1.6, text: "용어" });
  dataTable(slide, { x: X0, y: y + 0.12, w: CW, colW: [2.6, 12.3], minRowH: 0.5, boldFirstCol: true, fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    header: ["용어", "한 줄 풀이"], label: "용어 표", rows: [
      ["NL2SQL", "사람이 쓴 질문(Natural Language)을 LLM이 DB 조회 문장(SQL)으로 바꾸는 방식"],
      ["정형쿼리", "자주 묻는 질문에 쓰려고 미리 만들어 검사까지 끝낸 고정 SQL. ID로 골라 씀"],
      ["뷰(View)", "원본 표를 그대로 보여 주지 않고, 필요한 컬럼과 기간만 골라 보여 주는 가상의 표"],
      ["행 수준 보안(RLS)", "DB가 행마다 \"이 회원의 행인가\"를 검사해, 지정한 회원의 행만 보이게 거르는 기능"],
      ["세션 변수", "DB 접속 하나에만 잠시 붙여 두는 값. 여기서는 회원ID, 기준일, 거래 제공 시작일"],
      ["최악값", "타임아웃까지 기다리고 재시도까지 다 썼을 때 걸리는 가장 긴 시간"],
      ["반복 구간", "결과가 기준에 못 미칠 때 앞 단계로 되돌아가 다시 도는 구간"],
      ["착지 단계", "시간이 모자라거나 재시도를 다 썼을 때 이어서 가는 단계"],
    ] });
}

async function createSlide04() {
  const slide = newSlide("목차", "설계 가이드의 작성 순서 ① ~ ⑥을 따라 구성함");
  const cols = [
    [["1", "단계 도출 및 순서 정의", "단계 목록, 흐름 도식, Mermaid"], ["2", "단계별 명세", "S-R1 ~ S-R6 단계마다 2장"]],
    [["3", "외부시스템 연동 명세", "Groq LLM 연동과 초과 시 처리"], ["4", "반복 구간 명세", "L-1 재계획 구간"],
      ["5", "워크플로우 명세", "최악값 합계와 시간 예산 대조"]],
    [["C", "커넥터 설계", "목록, LLM 명세, 프롬프트, 응답 구조"], ["6", "남은 시간 예산 정책", "측정 시점, 계산 예, 착지"],
      ["+", "부록", "뷰, 정형쿼리, 검증 규칙, 필드, 오류, 점검표"]],
  ];
  const cw = (CW - GAP * 2) / 3;
  cols.forEach((items, ci) => {
    const x = X0 + ci * (cw + GAP);
    items.forEach(([n, t, d], i) => {
      const y = BODY_TOP + i * 1.95;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: 1.75, rectRadius: 0.1,
        fill: { color: C.tint }, line: { color: C.border, width: 1 } });
      numBadge(slide, { x: x + 0.2, y: y + 0.2, n, color: ci === 2 && i === 0 ? C.dark : C.navy, size: 0.5 });
      slide.addText(t, { x: x + 0.85, y: y + 0.2, w: cw - 1.0, h: 0.5, margin: 0, valign: "middle",
        fontFace: FONT, fontSize: fsMin(20), bold: true, color: C.navy });
      slide.addText(d, { x: x + 0.2, y: y + 0.85, w: cw - 0.4, h: 0.75, margin: 0, valign: "top",
        fontFace: FONT, fontSize: fsMin(16), color: C.body });
    });
  });
}

// ---------------------------------------------------------------------------
// 슬라이드 5 ~ 7: ① 단계 도출
// ---------------------------------------------------------------------------
async function createSlide05() {
  const slide = newSlide("① 단계 목록과 흐름 유형",
    "입력 워크플로우 6단계를 그대로 쓰고, 검증 실패 시 되돌아가는 반복 구간 1개를 둠");
  const wL = 8.9;
  dataTable(slide, { x: X0, y: BODY_TOP, w: wL, colW: [1.0, 2.9, 2.6, 2.4], minRowH: 0.62, boldFirstCol: true, fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    header: ["단계ID", "단계명", "담당자 유형", "흐름"], label: "단계 목록", rows: [
      ["S-R1", "검색 요청 접수와 검증", "규칙기반 코드", "순차"],
      ["S-R2", "정형쿼리 또는 NL2SQL 판단", "생성형AI + 규칙기반 코드", "순차(반복 구간 시작)"],
      ["S-R3", "계획 적합성 판정", "규칙기반 코드", "분기(적합, 부적합, 답할 수 없음)"],
      ["S-R4", "SQL 검증", "규칙기반 코드", "분기(통과, 재생성, 오류 종료)"],
      ["S-R5", "SQL 실행", "규칙기반 코드", "순차(실패 시 오류 종료)"],
      ["S-R6", "응답 구성과 반환", "규칙기반 코드", "합류(S-R5, S-R3)"],
    ] });
  listBox(slide, { x: X0 + wL + GAP, y: BODY_TOP, w: CW - wL - GAP, title: "흐름 유형 판단 이유", fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    label: "흐름 유형", items: [
      "순차: 앞 단계 출력이 뒤 단계 입력이라 차례대로 이어짐",
      "분기: S-R3은 계획이 맞는지, S-R4는 SQL이 규칙을 지키는지에 따라 경로가 하나로 갈림",
      "반복: 부적합 또는 검증 실패면 사유를 붙여 S-R2로 1회 되돌아감(사용자 결정 D-06, D-08)",
      "병렬 없음: 모든 단계가 앞 단계 결과를 써야 하므로 동시에 돌릴 단계가 없음",
    ] });
}

// 흐름 도식: 도형으로 그려 PowerPoint에서 바로 고칠 수 있게 함
const FLOW_EDGES = [];
async function createSlide06() {
  const slide = newSlide("① 흐름 도식",
    "반복 구간 L-1은 S-R2 ~ S-R4이며, 그림의 오류 종료 두 곳에 예외 경로(점선)를 더해 그림");
  const cy = 3.75, bw = 1.6, bh = 1.05, dw = 1.0, tw = 0.75;
  const seq = [["T", tw], ["R1", bw], ["R2", bw], ["R3", bw], ["D3", dw], ["R4", bw], ["D4", dw], ["R5", bw], ["R6", bw]];
  const g = (CW - seq.reduce((a, [, w]) => a + w, 0)) / (seq.length - 1);
  const pos = {};
  let x = X0;
  seq.forEach(([id, w]) => { pos[id] = { x, w, cx: x + w / 2, r: x + w }; x += w + g; });
  const STYLE = {
    llm: { fill: C.blue, line: C.blue, color: C.white },
    rule: { fill: C.white, line: C.navy, color: C.navy },
    db: { fill: C.tableHead, line: C.navy, color: C.navy },
  };
  const boxes = {
    R1: ["S-R1\n검색 요청\n접수와 검증", "db"], R2: ["S-R2\n정형쿼리 또는\nNL2SQL 판단", "llm"],
    R3: ["S-R3\n계획 적합성\n판정", "rule"], R4: ["S-R4\nSQL 검증", "rule"],
    R5: ["S-R5\nSQL 실행", "db"], R6: ["S-R6\n응답 구성과\n반환", "rule"],
  };
  const top = cy - bh / 2, bot = cy + bh / 2;
  slide.addShape(pptx.shapes.OVAL, { x: pos.T.x, y: cy - tw / 2, w: tw, h: tw, fill: { color: C.dark }, line: { type: "none" } });
  slide.addText("요청", { x: pos.T.x, y: cy - tw / 2, w: tw, h: tw, margin: 0, align: "center", valign: "middle",
    fontFace: FONT, fontSize: fsMin(14), bold: true, color: C.white });
  Object.entries(boxes).forEach(([id, [t, kind]]) => {
    const s = STYLE[kind];
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: pos[id].x, y: top, w: bw, h: bh, rectRadius: 0.08,
      fill: { color: s.fill }, line: { color: s.line, width: 1.5 } });
    slide.addText(t, { x: pos[id].x, y: top, w: bw, h: bh, margin: 0.03, align: "center", valign: "middle",
      fontFace: FONT, fontSize: fsMin(14), bold: true, color: s.color });
  });
  [["D3", "적합?"], ["D4", "통과?"]].forEach(([id, t]) => {
    slide.addShape(pptx.shapes.DIAMOND, { x: pos[id].x, y: cy - dw / 2, w: dw, h: dw,
      fill: { color: C.tint }, line: { color: C.navy, width: 1.5 } });
    slide.addText(t, { x: pos[id].x, y: cy - dw / 2, w: dw, h: dw, margin: 0, align: "center", valign: "middle",
      fontFace: FONT, fontSize: fsMin(14), bold: true, color: C.navy });
  });
  // 가로 한 줄 화살표
  const fwd = [["T", "R1"], ["R1", "R2"], ["R2", "R3"], ["R3", "D3"], ["D3", "R4"], ["R4", "D4"], ["D4", "R5"], ["R5", "R6"]];
  fwd.forEach(([a, b]) => seg(slide, pos[a].r, cy, pos[b].x, cy, { arrow: true }));
  [["D3", "R4"], ["D4", "R5"]].forEach(([a, b]) => slide.addText("예", { x: pos[a].r - 0.05, y: cy - 0.42, w: g + 0.1,
    h: 0.32, margin: 0, align: "center", fontFace: FONT, fontSize: fsMin(14), color: C.slate }));
  // 위쪽 되돌림(L-1)
  slide.addText("반복 구간 L-1: S-R2 ~ S-R4, 재시도 1회(위쪽 되돌림 화살표)", { x: X0, y: 1.92, w: 7.2, h: 0.32, margin: 0,
    fontFace: FONT, fontSize: fsMin(15), bold: true, color: C.blue });
  const yA = 2.9, yB = 2.55;
  seg(slide, pos.D3.cx, cy - dw / 2, pos.D3.cx, yA, { color: C.blue });
  seg(slide, pos.D3.cx, yA, pos.R2.cx + 0.3, yA, { color: C.blue });
  seg(slide, pos.R2.cx + 0.3, yA, pos.R2.cx + 0.3, top, { arrow: true, color: C.blue });
  slide.addText("부적합, 재시도 남음", { x: pos.R3.x - 0.3, y: yA + 0.02, w: bw + 0.6, h: 0.28, margin: 0, align: "center",
    fontFace: FONT, fontSize: fsMin(14), color: C.blue });
  seg(slide, pos.D4.cx, cy - dw / 2, pos.D4.cx, yB, { color: C.blue });
  seg(slide, pos.D4.cx, yB, pos.R2.cx - 0.3, yB, { color: C.blue });
  seg(slide, pos.R2.cx - 0.3, yB, pos.R2.cx - 0.3, top, { arrow: true, color: C.blue });
  slide.addText("검증 실패, 재시도 남음", { x: pos.R4.x - 0.4, y: yB - 0.32, w: bw + 0.8, h: 0.3, margin: 0, align: "center",
    fontFace: FONT, fontSize: fsMin(14), color: C.blue });
  // 아래쪽 오류 종료
  const yE = 4.95, eh = 0.55;
  const errBox = (cx, w, t) => {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: cx - w / 2, y: yE, w, h: eh, rectRadius: 0.12,
      fill: { color: C.white }, line: { color: C.sub, width: 1.5, dashType: "dash" } });
    slide.addText(t, { x: cx - w / 2, y: yE, w, h: eh, margin: 0, align: "center", valign: "middle",
      fontFace: FONT, fontSize: fsMin(14), bold: true, color: C.slate });
  };
  errBox(pos.D4.cx, 1.5, "오류 종료");
  seg(slide, pos.D4.cx, cy + dw / 2, pos.D4.cx, yE, { arrow: true, color: C.slate });
  slide.addText("재시도 소진", { x: pos.D4.cx + 0.08, y: 4.42, w: 1.3, h: 0.3, margin: 0, fontFace: FONT,
    fontSize: fsMin(14), color: C.slate });
  errBox(pos.R5.cx, 1.5, "오류 종료");
  seg(slide, pos.R5.cx, bot, pos.R5.cx, yE, { arrow: true, color: C.slate });
  slide.addText("실행 실패", { x: pos.R5.cx + 0.08, y: 4.42, w: 1.2, h: 0.3, margin: 0, fontFace: FONT,
    fontSize: fsMin(14), color: C.slate });
  const e0w = pos.R2.cx - pos.R1.cx + 1.2;
  errBox((pos.R1.cx + pos.R2.cx) / 2, e0w, "오류 종료(예외)");
  seg(slide, pos.R1.cx, bot, pos.R1.cx, yE, { arrow: true, dash: true, color: C.slate });
  seg(slide, pos.R2.cx, bot, pos.R2.cx, yE, { arrow: true, dash: true, color: C.slate });
  slide.addText("요청 거부", { x: pos.R1.cx - 1.15, y: 4.42, w: 1.1, h: 0.3, margin: 0, align: "right", fontFace: FONT,
    fontSize: fsMin(14), color: C.slate });
  slide.addText("LLM 대체 불가", { x: pos.R2.cx + 0.08, y: 4.42, w: 1.5, h: 0.3, margin: 0, fontFace: FONT,
    fontSize: fsMin(14), color: C.slate });
  slide.addText("시간 예산 부족(⑥)은 모든 단계에서 여기로 감", { x: pos.R1.x - 0.4, y: yE + eh + 0.05, w: 4.6, h: 0.3,
    margin: 0, fontFace: FONT, fontSize: fsMin(14), color: C.sub });
  // 답할 수 없음: S-R3 판정에서 S-R6으로
  const yU = 6.0;
  seg(slide, pos.D3.cx, cy + dw / 2, pos.D3.cx, yU, { color: C.navy });
  seg(slide, pos.D3.cx, yU, pos.R6.cx, yU, { color: C.navy });
  seg(slide, pos.R6.cx, yU, pos.R6.cx, bot, { arrow: true, color: C.navy });
  slide.addText("답할 수 없음(재시도 소진 또는 제공 기간 밖)", { x: pos.R4.x, y: yU + 0.04, w: 5.0, h: 0.3, margin: 0,
    align: "center", fontFace: FONT, fontSize: fsMin(14), color: C.navy });
  // 범례
  const ly = 6.6, cwL = CW / 3;
  const legend = [
    ["LLM 단계", (lx, yy) => slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: lx, y: yy, w: 0.55, h: 0.35, rectRadius: 0.05,
      fill: { color: C.blue }, line: { color: C.blue, width: 1 } })],
    ["규칙기반 단계", (lx, yy) => slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: lx, y: yy, w: 0.55, h: 0.35,
      rectRadius: 0.05, fill: { color: C.white }, line: { color: C.navy, width: 1.5 } })],
    ["규칙기반 + DB 조회 단계", (lx, yy) => slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: lx, y: yy, w: 0.55, h: 0.35,
      rectRadius: 0.05, fill: { color: C.tableHead }, line: { color: C.navy, width: 1.5 } })],
    ["분기 판정(마름모)", (lx, yy) => slide.addShape(pptx.shapes.DIAMOND, { x: lx + 0.08, y: yy - 0.05, w: 0.45, h: 0.45,
      fill: { color: C.tint }, line: { color: C.navy, width: 1.5 } })],
    ["오류 종료(점선 상자)", (lx, yy) => slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: lx, y: yy, w: 0.55, h: 0.35,
      rectRadius: 0.08, fill: { color: C.white }, line: { color: C.sub, width: 1.5, dashType: "dash" } })],
    ["예외 경로(점선 화살표)", (lx, yy) => seg(slide, lx, yy + 0.17, lx + 0.55, yy + 0.17, { arrow: true, dash: true, color: C.slate })],
  ];
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: X0, y: ly - 0.12, w: CW, h: 1.3, rectRadius: 0.08,
    fill: { color: C.altRow }, line: { color: C.border, width: 1 } });
  legend.forEach(([t, draw], i) => {
    const lx = X0 + 0.3 + (i % 3) * cwL, yy = ly + Math.floor(i / 3) * 0.55;
    draw(lx, yy);
    slide.addText(t, { x: lx + 0.7, y: yy - 0.02, w: cwL - 1.0, h: 0.4, margin: 0, valign: "middle", fontFace: FONT,
      fontSize: fsMin(15), color: C.body });
  });
  guardBottom("범례", ly - 0.12 + 1.3);
  // 논리 화살표 목록(도형과 같은 연결) — verify_calc.py가 Mermaid와 대조함
  FLOW_EDGES.push(["T", "R1"], ["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R3", "R2"], ["R3", "R6"],
    ["R4", "R5"], ["R4", "R2"], ["R4", "E1"], ["R5", "R6"], ["R5", "E2"], ["R1", "E0"], ["R2", "E0"]);
}

async function createSlide07() {
  const slide = newSlide("① Mermaid 도식 스크립트",
    "같은 흐름을 Mermaid 스크립트로도 남겨, mermaid.live에서 바로 고쳐 볼 수 있게 함");
  const lines = [
    "flowchart LR",
    "    T((동기 요청)) --> R1[S-R1 검색 요청 접수와 검증]",
    "    R1 --> R2[S-R2 정형쿼리 또는 NL2SQL 판단]",
    "    R2 --> R3{S-R3 계획 적합성 판정}",
    "    R3 -- 적합 --> R4{S-R4 SQL 검증}",
    "    R3 -- 부적합, 재시도 남음 --> R2",
    "    R3 -- 답할 수 없음 --> R6",
    "    R4 -- 통과 --> R5[S-R5 SQL 실행]",
    "    R4 -- 실패, 재시도 남음 --> R2",
    "    R4 -- 실패, 재시도 소진 --> E1([오류 종료])",
    "    R5 -- 성공 --> R6[S-R6 응답 구성과 반환]",
    "    R5 -- 실패 --> E2([오류 종료])",
    "    R1 -. 요청 거부 .-> E0([오류 종료 예외])",
    "    R2 -. LLM 대체 불가 .-> E0",
  ];
  const wL = 9.4;
  codeBox(slide, { x: X0, y: BODY_TOP, w: wL, lines, size: 18, label: "Mermaid" });
  const yb = listBox(slide, { x: X0 + wL + GAP, y: BODY_TOP, w: CW - wL - GAP, title: "보는 방법", size: 18,
    label: "보는 방법", items: ["mermaid.live/edit 접속", "왼쪽에 스크립트 붙여넣기", "오른쪽 위 전체보기 아이콘으로 확인"] });
  caption(slide, { x: X0 + wL + GAP, y: yb + 0.2, w: CW - wL - GAP,
    text: "시간 예산 부족(⑥)은 모든 단계에서 생길 수 있어 도식에서는 E0 하나로 묶음" });
}

// ---------------------------------------------------------------------------
// 슬라이드 8 ~ 19: ② 단계별 명세(단계마다 2장)
// ---------------------------------------------------------------------------
const STEPS = [
  {
    id: "S-R1", name: "검색 요청 접수와 검증",
    lead1: "요청을 받자마자 형식을 검사하고, 외부 LLM으로 나가기 전에 개인 식별자를 가림",
    overview: [
      ["단계ID", "S-R1"], ["단계명", "검색 요청 접수와 검증"], ["이전 단계", "트리거"],
      ["비즈니스 목표", "잘못된 요청과 없는 회원을 처음에 걸러, 뒤 단계의 LLM 비용과 시간을 아낌"],
      ["담당자 유형", "규칙기반 코드"], ["외부시스템", "없음(시스템 내부 DB)"],
      ["비고", "이름처럼 정규식으로 못 잡는 식별자는 남을 수 있음(위험 항목 R-04). 회원ID는 이후 LLM에 보내지 않음"],
    ],
    inputTitle: "입력 데이터(출처: 트리거)",
    inputs: [
      ["request_id", "string", "필수", "호출 추적 ID"],
      ["question", "string", "필수", "상담사 질문 원문. 1 ~ 500자"],
      ["member_id", "string", "필수", "상담 중인 회원ID"],
      ["base_date", "date", "선택", "조회 기준일. 없으면 lab_metadata의 데이터 기준일"],
    ],
    outputs: [
      ["request_id", "string", "필수", "입력 그대로"],
      ["masked_question", "string", "필수", "개인 식별자를 [가림]으로 바꾼 질문"],
      ["masked_count", "integer", "필수", "가린 개수"],
      ["member_id", "string", "필수", "세션 변수 전용. LLM에 보내지 않음"],
      ["base_date", "date", "필수", "확정 기준일"],
      ["coverage_start", "date", "필수", "거래 제공 시작일"],
      ["started_at", "datetime", "필수", "워크플로우 시작 시각. 남은 시간 계산 기준"],
      ["attempt", "integer", "필수", "계획 시도 횟수. 0으로 시작"],
    ],
    lead2: "형식 검사, 식별자 가림, 회원 확인을 차례로 하고, 실패하면 바로 오류를 돌려줌",
    tasks: [
      "started_at을 기록하고 남은 시간 예산을 측정함(⑥). 기준 미달이면 착지 단계로 감",
      "필수 필드 검사: question 1 ~ 500자, member_id 형식 M- + 숫자 4자리(설계 가정), base_date 형식 YYYY-MM-DD",
      "개인 식별자 가림: 정규식으로 전화번호, 카드번호(숫자 15 ~ 16자리), 주민등록번호, 이메일, 회원ID 패턴을 [가림]으로 바꾸고 개수를 셈(사용자 결정 D-07)",
      "읽기 전용 트랜잭션을 열고 statement_timeout을 남은 시간 예산 이하로 둔 뒤, public.lab_metadata에서 데이터 기준일과 거래 제공 시작일을 읽음(키 이름은 개발 시 확인)",
      "세션 변수 3개(app.member_id, app.base_date, app.coverage_start)를 set_config(이름, 값, true)로 지정하고 app_internal.member_basic에서 회원이 있는지, 가입일이 기준일 이전인지 확인한 뒤 트랜잭션을 끝냄",
      "attempt를 0으로 두고 출력 데이터를 만듦",
    ],
    errors: [
      "필드 누락, 형식 오류, 500자 초과, 기준일이 데이터 기준일보다 뒤 → INVALID_REQUEST(400)로 오류 종료",
      "회원 없음 또는 기준일에 아직 가입 전 → MEMBER_NOT_FOUND(404)로 오류 종료",
      "DB 접속 또는 조회 실패 → DB_ERROR(500)로 오류 종료",
      "시작 전 남은 시간 예산 부족 → TIME_BUDGET_EXCEEDED(504)로 오류 종료",
    ],
  },
  {
    id: "S-R2", name: "정형쿼리 또는 NL2SQL 판단",
    lead1: "LLM이 정형쿼리로 답할지, SQL을 새로 만들지를 정해 계획(plan) 하나로 돌려줌",
    overview: [
      ["단계ID", "S-R2"], ["단계명", "정형쿼리 또는 NL2SQL 판단"],
      ["이전 단계", "S-R1 검색 요청 접수와 검증, S-R3 계획 적합성 판정(부적합 시), S-R4 SQL 검증(실패 시)"],
      ["비즈니스 목표", "검사된 정형쿼리를 먼저 써서 정확도를 지키고, 정형쿼리로 못 답하는 질문만 NL2SQL로 넓힘"],
      ["담당자 유형", "생성형AI + 규칙기반 코드(LLM 실패 시 키워드 규칙)"], ["외부시스템", "Groq LLM API(C-01)"],
      ["비고", "반복 구간 L-1의 시작 단계. 시스템 프롬프트 전문은 이 스크립트 부록 A"],
    ],
    inputs: [
      ["masked_question", "string", "필수", "S-R1"],
      ["base_date", "date", "필수", "S-R1"],
      ["coverage_start", "date", "필수", "S-R1"],
      ["attempt", "integer", "필수", "첫 회 S-R1, 되돌아오면 S-R3 또는 S-R4"],
      ["retry_reason", "string", "선택", "S-R3 또는 S-R4. 첫 회 없음"],
      ["previous_sql", "string", "선택", "S-R4. 검증에 실패한 SQL"],
    ],
    inputHead: ["필드", "타입", "필수 여부", "출처와 설명"],
    outputs: [
      ["plan", "object", "필수", "route, query_id, sql, target_views, requested_period, reason. 구조는 커넥터 응답 데이터 구조"],
      ["plan_source", "string", "필수", "LLM 또는 KEYWORD_RULE"],
      ["attempt", "integer", "필수", "1 늘린 값"],
    ],
    lead2: "LLM 호출은 5초 안에 끝내고, 실패하면 키워드 규칙으로 정형쿼리를 고르는 대체 경로로 감",
    tasks: [
      "남은 시간 예산을 측정함(⑥). 기준 미달이면 착지(키워드 규칙 대체 경로)",
      "attempt를 1 늘림",
      "유저 프롬프트를 조립함(masked_question, base_date, coverage_start, attempt, retry_reason, previous_sql). member_id는 넣지 않음",
      "C-01을 호출함: timeout 5초, SDK max_retries 0, response_format json_schema strict",
      "응답 JSON을 plan으로 읽고 plan_source를 LLM으로 둠",
    ],
    errors: [
      "타임아웃, 연결 오류, 429(요청 한도 초과), 5xx, 400 → 재시도 없이 대체 경로: 부록 「정형쿼리 목록」의 키워드 규칙으로 정형쿼리 1개를 골라 plan(route FIXED)을 만들고 plan_source를 KEYWORD_RULE로 둠",
      "키워드 규칙에도 맞는 정형쿼리가 없음 → LLM_UNAVAILABLE(503)로 오류 종료",
      "LLM이 답을 거절함(refusal) → route UNANSWERABLE 계획으로 S-R3에 넘김",
      "429의 retry-after는 기록만 하고 기다리지 않음(시간 예산 보호)",
    ],
  },
  {
    id: "S-R3", name: "계획 적합성 판정",
    lead1: "계획이 실제로 실행할 수 있고 데이터 제공 기간 안인지 규칙으로 판정함",
    overview: [
      ["단계ID", "S-R3"], ["단계명", "계획 적합성 판정"], ["이전 단계", "S-R2 정형쿼리 또는 NL2SQL 판단"],
      ["비즈니스 목표", "쓸모없는 SQL 검증과 실행을 막고, 답할 수 없는 질문은 빨리 \"답할 수 없음\"으로 알림"],
      ["담당자 유형", "규칙기반 코드"], ["외부시스템", "없음"],
      ["비고", "기간 판정 기준은 뷰 정의(04 ~ 06 SQL)에서 가져옴. 데이터 제공 기간 밖이면 다시 계획해도 바뀌지 않아 재시도 안 함"],
    ],
    inputs: [
      ["plan", "object", "필수", "S-R2"], ["plan_source", "string", "필수", "S-R2"], ["attempt", "integer", "필수", "S-R2"],
      ["base_date", "date", "필수", "S-R1"], ["coverage_start", "date", "필수", "S-R1"],
    ],
    inputHead: ["필드", "타입", "필수 여부", "출처"],
    outputs: [
      ["verdict", "string", "필수", "FIT, UNFIT, UNANSWERABLE 중 하나"],
      ["candidate_sql", "string", "선택", "FIT일 때 검증할 SQL"],
      ["sql_source", "string", "선택", "FIXED 또는 NL2SQL"],
      ["query_id", "string", "선택", "정형쿼리ID"],
      ["retry_reason", "string", "선택", "UNFIT 사유"],
      ["unanswerable_reason", "string", "선택", "답할 수 없는 이유"],
    ],
    lead2: "적합하면 S-R4, 부적합이면 S-R2로 1회 되돌리고, 답할 수 없으면 S-R6으로 보냄",
    tasks: [
      "남은 시간 예산을 측정함(⑥)",
      "route가 UNANSWERABLE이면 verdict UNANSWERABLE(사유는 plan.reason)",
      "route가 FIXED이면 query_id가 FQ-01 ~ FQ-08 중 하나인지 확인하고, 등록된 SQL을 candidate_sql로 둠",
      "route가 NL2SQL이면 sql이 비어 있지 않은지, target_views가 허용 뷰 7개 안인지 확인함",
      "requested_period가 있으면 대상 뷰의 제공 기간(월 집계 6개월, 일별 90일, 연체 이력 12개월) 안이고 기준일 이전인지 확인. 밖이면 verdict UNANSWERABLE(데이터 제공 기간 밖)",
      "다음 단계 결정: FIT → S-R4 / UNFIT이고 attempt 1 → S-R2 / UNFIT이고 attempt 2 → UNANSWERABLE로 바꿔 S-R6 / UNANSWERABLE → S-R6",
    ],
    errors: [
      "plan 필드 누락(구조화 출력이라 드묾) → UNFIT으로 처리",
      "3, 4번 확인 실패 → UNFIT, retry_reason에 사유 코드(예: UNKNOWN_QUERY_ID, VIEW_NOT_ALLOWED)",
      "오류 종료 없음: 재시도를 다 써도 \"답할 수 없음\" 정상 응답으로 끝냄(사용자 결정 D-08)",
    ],
  },
  {
    id: "S-R4", name: "SQL 검증",
    lead1: "LLM이 만든 SQL은 이 검사를 통과하기 전에는 절대 실행하지 않음",
    overview: [
      ["단계ID", "S-R4"], ["단계명", "SQL 검증"], ["이전 단계", "S-R3 계획 적합성 판정(FIT)"],
      ["비즈니스 목표", "허용한 뷰, 컬럼, 함수만 읽는 SELECT 한 문장만 통과시켜 데이터 유출과 DB 부담을 막음"],
      ["담당자 유형", "규칙기반 코드"], ["외부시스템", "없음"],
      ["비고", "정형쿼리도 같은 검사를 거침(이중 안전장치). 검증 규칙 전체는 부록 「SQL 검증 규칙」"],
    ],
    inputs: [
      ["candidate_sql", "string", "필수", "S-R3"], ["sql_source", "string", "필수", "S-R3"],
      ["query_id", "string", "선택", "S-R3"], ["attempt", "integer", "필수", "S-R2"],
    ],
    inputHead: ["필드", "타입", "필수 여부", "출처"],
    outputs: [
      ["validated_sql", "string", "필수", "검증을 통과하고 LIMIT을 맞춘 SQL"],
      ["row_limit", "integer", "필수", "결과 행 상한 200"],
      ["retry_reason", "string", "선택", "검증 실패 사유 코드"],
      ["previous_sql", "string", "선택", "검증에 실패한 SQL. LLM 재생성 참고용"],
    ],
    lead2: "문자열 비교가 아니라 문법 트리로 검사하고, 행 상한을 강제로 붙임",
    tasks: [
      "남은 시간 예산을 측정함(⑥)",
      "PostgreSQL 문법 파서로 SQL을 문법 트리로 바꿈(라이브러리는 개발 시 선택, 예: sqlglot 또는 pglast)",
      "문장이 하나이고 SELECT(WITH 포함)인지 확인",
      "참조한 모든 표가 허용 뷰 7개(app. 스키마)인지 확인",
      "컬럼이 그 뷰의 컬럼 목록 안인지, 함수가 허용 함수 목록 안인지 확인",
      "금지 구문(쓰기, 여러 문장, 주석, FOR UPDATE, SELECT INTO, 금지 함수) 검사",
      "LIMIT이 없으면 LIMIT 200을 붙이고, 200보다 크면 200으로 낮춤",
    ],
    errors: [
      "검사 실패 + sql_source NL2SQL + attempt 1 → 사유와 직전 SQL을 담아 S-R2로 되돌아감(L-1)",
      "검사 실패 + attempt 2 → SQL_VALIDATION_FAILED(422)로 오류 종료",
      "검사 실패 + sql_source FIXED → 정형쿼리 등록 오류이므로 SQL_VALIDATION_FAILED(422)로 오류 종료하고 운영 알림",
      "오류 메시지에는 SQL, 뷰 이름, 컬럼 이름을 넣지 않음(사유 코드는 로그에만)",
    ],
  },
  {
    id: "S-R5", name: "SQL 실행",
    lead1: "읽기 전용 트랜잭션 안에서 회원 세션 변수를 걸고 실행해, 그 회원의 행만 읽음",
    overview: [
      ["단계ID", "S-R5"], ["단계명", "SQL 실행"], ["이전 단계", "S-R4 SQL 검증(통과)"],
      ["비즈니스 목표", "검증된 SQL을 회원 범위 안에서 시간 예산 안에 실행해 답의 근거 데이터를 얻음"],
      ["담당자 유형", "규칙기반 코드"], ["외부시스템", "없음(시스템 내부 DB)"],
      ["비고", "DB 조회 시간은 최악값 합계에 넣지 않고 여유 4초 안에서 실측으로 확인. FQ-08은 실행 계획 비용이 커 실측 필수"],
    ],
    inputs: [
      ["validated_sql", "string", "필수", "S-R4"], ["member_id", "string", "필수", "S-R1"],
      ["base_date", "date", "필수", "S-R1"], ["coverage_start", "date", "필수", "S-R1"], ["started_at", "datetime", "필수", "S-R1"],
    ],
    inputHead: ["필드", "타입", "필수 여부", "출처"],
    outputs: [
      ["columns", "array", "필수", "컬럼 이름과 타입 목록"],
      ["rows", "array", "필수", "결과 행. 최대 200행"],
      ["row_count", "integer", "필수", "결과 행 수"],
      ["truncated", "boolean", "필수", "행 상한 200에 닿았는지"],
      ["db_elapsed_ms", "integer", "필수", "DB 실행 시간"],
    ],
    lead2: "세션 변수, 읽기 전용, 실행 제한 시간, 행 상한 네 가지를 매번 실행 직전에 지정함",
    tasks: [
      "남은 시간 예산을 측정함(⑥). 기준 미달이면 착지(안전 종료)",
      "커넥션 풀에서 sql_retriever_user 접속을 받음",
      "BEGIN READ ONLY로 읽기 전용 트랜잭션을 시작함",
      "SET LOCAL statement_timeout을 그 시점 남은 시간 예산 이하(밀리초, 내림)로 지정함",
      "set_config('app.member_id', member_id, true), app.base_date, app.coverage_start를 지정함(트랜잭션 안에서만 유효)",
      "validated_sql을 실행하고 최대 200행을 받음",
      "ROLLBACK으로 끝내 세션 변수를 함께 지우고 커넥션을 돌려줌",
    ],
    errors: [
      "실행 제한 시간 초과 → DB_TIMEOUT(504)로 오류 종료",
      "그 밖의 DB 오류 → DB_ERROR(500)로 오류 종료",
      "결과 0행은 오류가 아님(그 회원에게 해당 데이터가 없음) → S-R6로 감",
      "세션 변수를 빼먹으면 행 수준 보안 때문에 0행이 나옴 → 0행이 잦으면 세션 변수 지정 누락을 먼저 의심",
    ],
  },
  {
    id: "S-R6", name: "응답 구성과 반환",
    lead1: "결과 또는 \"답할 수 없음\"을 같은 응답 형식으로 돌려주고, SQL과 회원ID는 응답에 넣지 않음",
    overview: [
      ["단계ID", "S-R6"], ["단계명", "응답 구성과 반환"],
      ["이전 단계", "S-R5 SQL 실행, S-R3 계획 적합성 판정(답할 수 없음)"],
      ["비즈니스 목표", "호출자가 바로 답변에 쓸 수 있는 근거 데이터와 안내 문장을 한 형식으로 넘김"],
      ["담당자 유형", "규칙기반 코드"], ["외부시스템", "없음"],
      ["비고", "종료 처리 시간 1초 안에서 수행. 응답 필드 영문명은 부록 「필드 영문명」"],
    ],
    inputs: [
      ["S-R1", "request_id, started_at, base_date, coverage_start"],
      ["S-R2", "plan_source, attempt"],
      ["S-R3", "verdict, sql_source, query_id, unanswerable_reason"],
      ["S-R5", "columns, rows, row_count, truncated, db_elapsed_ms(답할 수 없음이면 없음)"],
    ],
    inputHead: ["출처", "필드"],
    outputs: [
      ["request_id", "string", "필수", "요청 추적 ID"],
      ["status", "string", "필수", "OK 또는 UNANSWERABLE"],
      ["route", "string", "선택", "FIXED 또는 NL2SQL"],
      ["query_id", "string", "선택", "정형쿼리ID"],
      ["plan_source", "string", "필수", "LLM 또는 KEYWORD_RULE"],
      ["columns", "array", "필수", "컬럼 이름과 타입 목록"],
      ["rows", "array", "필수", "결과 행"],
      ["row_count", "integer", "필수", "결과 행 수"],
      ["truncated", "boolean", "필수", "행 상한 도달 여부"],
      ["base_date", "date", "필수", "조회 기준일"],
      ["coverage_start", "date", "필수", "거래 제공 시작일"],
      ["message", "string", "필수", "상담사에게 보여 줄 한 줄 안내"],
      ["elapsed_ms", "integer", "필수", "전체 처리 시간"],
    ],
    outputTitle: "출력 데이터(호출자 응답)",
    inputsLeft: true, leftW: 7.4,
    lead2: "정해진 문장 틀로 안내를 만들고, 감사 로그를 남긴 뒤 반환함",
    tasks: [
      "남은 시간을 측정함. 종료 처리 시간 1초를 미리 떼어 두었으므로 기준 미달이어도 실행함",
      "verdict가 UNANSWERABLE이면 status UNANSWERABLE, 아니면 OK",
      "message를 문장 틀로 만듦: \"기준일 {base_date} 기준 {row_count}건\" / 200건 도달 시 \"앞 200건만 보여 줌\" / 0건 시 \"해당 데이터 없음\" / 답할 수 없음 시 사유",
      "응답 JSON을 구성함(SQL 문장, 회원ID, 내부 뷰 이름은 넣지 않음)",
      "감사 로그 기록: request_id, route, query_id, plan_source, attempt, elapsed_ms, row_count(질문은 가린 문장만, 회원ID는 해시값)",
      "HTTP 200으로 반환",
    ],
    errors: [
      "응답 구성 또는 직렬화 실패 → INTERNAL_ERROR(500)로 오류 종료",
      "감사 로그 기록 실패 → 응답은 그대로 반환하고 로그 실패만 따로 알림(응답을 막지 않음)",
    ],
  },
];

function stepSlides(step) {
  return [
    async function () {
      const slide = newSlide(`② ${step.id} ${step.name} (개요와 데이터)`, step.lead1);
      const wL = step.leftW || 5.3, xR = X0 + wL + GAP, wR = CW - wL - GAP;
      // 입력 표: 기본은 오른쪽 위, 출력 필드가 많은 단계(S-R6)는 왼쪽 개요 아래에 둠
      const inX = step.inputsLeft ? X0 : xR, inW = step.inputsLeft ? wL : wR;
      const inHead = step.inputHead || ["필드", "타입", "필수 여부", "설명"];
      const T4 = [2.1, 1.0, 1.25, 3.95];
      const ovT = { w: wL, colW: [1.5, 3.8], rows: step.overview, minRowH: 0.32 };
      const inT = { w: inW, colW: inHead.length === 2 ? [0.9, 4.4] : T4, header: inHead, rows: step.inputs, minRowH: 0.32 };
      const outT = { w: wR, colW: T4, header: ["필드", "타입", "필수 여부", "설명"], rows: step.outputs, minRowH: 0.32 };
      const BADGE = 0.48, SEP = 0.12, ROOM = BODY_BOTTOM - BODY_TOP;
      // 왼쪽 열과 오른쪽 열이 모두 들어가는 가장 큰 글자 크기를 고르고, 남는 높이는 열마다 행에 나눔
      const cols = (s) => {
        const o = tableMeasure({ ...ovT, size: s }), i = tableMeasure({ ...inT, size: s }), u = tableMeasure({ ...outT, size: s });
        return step.inputsLeft
          ? { L: BADGE + o.total + SEP + BADGE + i.total, nL: o.rowH.length + i.rowH.length, R: BADGE + u.total, nR: u.rowH.length }
          : { L: BADGE + o.total, nL: o.rowH.length, R: BADGE + i.total + SEP + BADGE + u.total, nR: i.rowH.length + u.rowH.length };
      };
      let s = 16;
      for (; s > MIN_FONT; s--) { const c = cols(s); if (c.L <= ROOM && c.R <= ROOM) break; }
      const c = cols(s);
      const addL = Math.max(0, Math.min(0.25, (ROOM - c.L) / c.nL)), addR = Math.max(0, Math.min(0.25, (ROOM - c.R) / c.nR));
      const inAdd = step.inputsLeft ? addL : addR;
      let y = darkBadge(slide, { x: X0, y: BODY_TOP, w: 2.0, text: "단계 개요" });
      const yO = dataTable(slide, { ...ovT, x: X0, y: y + 0.08, size: s, rowAdd: addL, boldFirstCol: true, label: `${step.id} 개요` });
      y = darkBadge(slide, { x: inX, y: step.inputsLeft ? yO + SEP : BODY_TOP, w: 3.6, text: step.inputTitle || "입력 데이터" });
      const yI = dataTable(slide, { ...inT, x: inX, y: y + 0.08, size: s, rowAdd: inAdd, label: `${step.id} 입력` });
      y = darkBadge(slide, { x: xR, y: step.inputsLeft ? BODY_TOP : yI + SEP, w: 3.6, text: step.outputTitle || "출력 데이터" });
      dataTable(slide, { ...outT, x: xR, y: y + 0.08, size: s, rowAdd: addR, label: `${step.id} 출력` });
    },
    async function () {
      const slide = newSlide(`② ${step.id} ${step.name} (수행 작업과 예외 처리)`, step.lead2);
      twoColumns(slide, { left: { title: "수행 작업", items: step.tasks }, right: { title: "예외 처리", items: step.errors,
        numbered: false } });
    },
  ];
}

// ---------------------------------------------------------------------------
// 슬라이드 20 ~ 22: ③ ~ ⑤
// ---------------------------------------------------------------------------
async function createSlide20() {
  const slide = newSlide("③ 외부시스템 연동 명세", "외부 연동은 Groq LLM 1개뿐이며, 최악값은 5초 × (1 + 0) = 5초임");
  let y = dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [0.9, 2.6, 1.0, 1.0, 1.5, 0.9, 1.9, 3.3], size: 16,
    minRowH: 0.5, label: "연동 명세",
    header: ["단계ID", "외부시스템", "연동 유형", "커넥터ID", "타임아웃", "재시도", "최악값", "초과 시 처리"],
    rows: [["S-R2", "Groq LLM API(openai/gpt-oss-120b)", "LLM", "C-01", "5초(설계 가정)", "0", "5 × (1 + 0) = 5초",
      "대체 경로로 계속(키워드 규칙 정형쿼리)"]] });
  y = listBox(slide, { x: X0, y: y + 0.25, w: CW, title: "초과 시 처리 검토 순서와 판단 이유", label: "검토 순서", fit: { bottom: BODY_BOTTOM - 0.95, maxSize: 18 },
    items: [
      "부분결과로 계속: 불가. 계획(SQL) 없이는 실행할 것이 없어 품질이 낮은 결과도 낼 수 없음",
      "대체 경로로 계속: 채택. 정형쿼리 8개는 LLM 없이 키워드 규칙으로도 고를 수 있음(부록 「정형쿼리 목록」)",
      "안전 종료: 키워드 규칙에도 맞는 정형쿼리가 없을 때만 LLM_UNAVAILABLE(503)로 끝냄",
    ] });
  y = caption(slide, { y: y + 0.2, text: "재시도 0회 이유: 재시도 역할은 반복 구간 L-1의 1회가 맡음. 연동 재시도까지 두면 최악값이 15초 예산을 넘음" });
  caption(slide, { y: y + 0.05, text: "DB는 시스템 내부 구성요소라 이 표에 넣지 않음(사용자 결정)" });
}

async function createSlide21() {
  const slide = newSlide("④ 반복 구간 명세", "계획 부적합 또는 SQL 검증 실패면 사유를 붙여 S-R2부터 1번 더 돌고, 최악값은 10초임");
  let y = dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [1.3, 3.6, 1.5, 0.9, 2.5, 5.1], size: 16, minRowH: 0.5,
    label: "반복 구간",
    header: ["반복구간ID", "비즈니스 목표", "단계ID", "재시도", "최악값", "착지 단계"],
    rows: [["L-1", "계획이 적합하고 SQL이 검증을 통과할 때까지 계획을 1번 다시 만듦", "S-R2 ~ S-R4", "1",
      "(5 + 0 + 0) × (1 + 1) = 10초", "S-R3 부적합 → S-R6(답할 수 없음), S-R4 실패 → 오류 종료(SQL_VALIDATION_FAILED)"]] });
  const wL = 7.2;
  codeBox(slide, { x: X0, y: y + 0.3, w: wL, size: 16, label: "반복 계산", lines: [
    "반복구간 L-1 (재시도 1회)",
    "  S-R2: 외부 연동 최악값 5 × (1 + 0) = 5초",
    "  S-R3: 외부 연동 없음(규칙 처리 시간은 여유 몫) → 0초",
    "  S-R4: 외부 연동 없음(규칙 처리 시간은 여유 몫) → 0초",
    "  구간 최악값 = (5 + 0 + 0) × (1 + 1) = 10초",
  ] });
  listBox(slide, { x: X0 + wL + GAP, y: y + 0.3, w: CW - wL - GAP, title: "착지 단계 판단 이유", label: "착지 이유", fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    items: [
      "S-R3 부적합 착지: 부분결과로 계속. 오류가 아니라 \"답할 수 없음\"이라는 정상 응답으로 S-R6에서 끝냄",
      "S-R4 실패 착지: 안전 종료. 검증을 못 통과한 SQL은 실행하지 않는다는 원칙 때문에 부분결과와 대체 경로가 없음",
    ] });
}

async function createSlide22() {
  const slide = newSlide("⑤ 워크플로우 명세", "최악값 합계 10초는 전체 시간 예산 15초 안에 들고, 남는 5초를 종료 처리와 DB 조회 몫으로 씀");
  const wL = 7.0;
  const yT = dataTable(slide, { x: X0, y: BODY_TOP, w: wL, colW: [1.9, 5.1], minRowH: 0.42, boldFirstCol: true, fit: { bottom: BODY_BOTTOM - 0.85, maxSize: 18 },
    label: "워크플로우 명세", header: ["항목", "값"], rows: [
      ["워크플로우ID", "W-1"], ["이름", "SQL 검색기"],
      ["비즈니스 목표", "상담사가 통화 중에 회원 데이터 근거를 바로 받아, 추측 없이 정확하게 답할 수 있게 함"],
      ["전체 시간 예산", "15초"], ["종료 처리 시간", "1초"],
      ["최악값 합계", "S-R1 0초 + L-1 10초 + S-R5 0초 + S-R6 0초 = 10초 (≤ 15초)"],
      ["재개 방안", "해당없음(조회만 하고 바깥에 반영하는 작업이 없어 처음부터 다시 해도 문제없음)"],
    ] });
  const yC = codeBox(slide, { x: X0 + wL + GAP, y: BODY_TOP, w: CW - wL - GAP, size: 15, label: "합계 계산", lines: [
    "[최악값 합계]",
    "  반복구간 밖 단계: S-R1 0초, S-R5 0초, S-R6 0초 (외부 연동 없음)",
    "  반복구간 최악값: L-1 10초",
    "  분기: S-R3 → S-R6(답할 수 없음) 경로는 S-R4, S-R5를 건너뛰어",
    "        가장 큰 경로(S-R1 → L-1 → S-R5 → S-R6)를 씀",
    "  최악값 합계 = 0 + 10 + 0 + 0 = 10초 ≤ 15초 → 통과",
    "",
    "[여유 시간]",
    "  15 - 10 = 5초 = 종료 처리 1초 + DB 조회와 규칙 처리 4초",
    "  DB 조회: S-R1 회원 확인, S-R5 SQL 실행",
    "  규칙 처리: 정규식 가림, 계획 판정, SQL 파싱",
    "  → 4초 안에 드는지 개발 후 실측으로 확인",
  ] });
  caption(slide, { y: Math.max(yT, yC) + 0.2, text: "예산 조정 과정: 처음 안(LLM 타임아웃 5초, 재시도 1회)은 L-1 = (5 × 2) × 2 = 20초로 15초를 넘어, "
    + "연동 재시도를 0회로 줄이고 재시도 역할을 L-1에 맡김" });
}

// ---------------------------------------------------------------------------
// 슬라이드 23 ~ 26: 커넥터 설계
// ---------------------------------------------------------------------------
async function createSlide23() {
  const slide = newSlide("커넥터 목록", "커넥터는 Groq LLM 1개이며, 제공자와 모델은 실행 설정으로 고르는 구조로 둠");
  const wL = 8.4;
  let y = darkBadge(slide, { x: X0, y: BODY_TOP, w: 2.2, text: "커넥터 목록" });
  y = dataTable(slide, { x: X0, y: y + 0.1, w: wL, colW: [0.9, 2.3, 1.3, 3.9], size: 18, minRowH: 0.7, label: "커넥터 목록",
    header: ["ID", "커넥터명", "연동 방식", "제공자"],
    rows: [["C-01", "SQL 계획 생성 LLM", "LLM", "Groq(모델 openai/gpt-oss-120b, 개발사 OpenAI)"]] });
  caption(slide, { x: X0, y: y + 0.2, w: wL, size: 16, color: C.ink,
    text: "DB(PostgreSQL cardlab)는 시스템 내부 구성요소로 취급해 커넥터 목록에서 뺌(사용자 결정)" });
  listBox(slide, { x: X0 + wL + GAP, y: BODY_TOP, w: CW - wL - GAP, title: "실행 설정으로 고르는 구조", fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    label: "실행 설정", items: [
      "SQL_RETRIEVER_LLM_PROVIDER = groq",
      "SQL_RETRIEVER_LLM_MODEL = openai/gpt-oss-120b",
      "API 키는 GROQ_API_KEY 환경변수로만 주입(코드, 이미지, 로그에 넣지 않음)",
      "제공자를 더하면 같은 응답 구조(부록 A의 JSON Schema)를 지키는 어댑터를 하나 더 만듦",
    ] });
  sourceLine(slide, "출처: console.groq.com/docs/openai, /docs/model/openai/gpt-oss-120b (조사일 2026-10-15)");
}

async function createSlide24() {
  const slide = newSlide("C-01 LLM 명세: 모델과 하이퍼파라미터",
    "값은 모두 Groq 공식 문서의 범위 안에서 정했고, 근거가 없는 수치는 설계 가정으로 표시함");
  const wL = 10.0;
  dataTable(slide, { x: X0, y: BODY_TOP, w: wL, colW: [2.2, 3.5, 4.3], minRowH: 0.3, boldFirstCol: true, fit: { bottom: BODY_BOTTOM, maxSize: 16 },
    label: "LLM 명세", header: ["항목", "값", "문서 범위 또는 근거"], rows: [
      ["커넥터 ID", "C-01", "커넥터 목록"],
      ["베이스 URL", "https://api.groq.com/openai/v1", "OpenAI 호환 문서"],
      ["엔드포인트", "POST /chat/completions", "API Reference"],
      ["인증", "Authorization: Bearer $GROQ_API_KEY", "API Reference"],
      ["모델", "openai/gpt-oss-120b", "문맥 131,072, 최대 출력 65,536 토큰"],
      ["temperature", "0.2(설계 가정)", "0 ~ 2, 기본 1"],
      ["top_p", "1(기본값, 바꾸지 않음)", "0 ~ 1. temperature와 하나만 바꾸도록 권고"],
      ["reasoning_effort", "low(설계 가정)", "low, medium(기본), high"],
      ["include_reasoning", "false", "추론 문장을 응답에서 뺌"],
      ["max_completion_tokens", "4096(사용자 결정)", "입력 + 출력 ≤ 문맥 길이"],
      ["seed", "42", "결정적 샘플링은 최선 노력, 보장 안 함"],
      ["response_format", "json_schema, strict: true", "gpt-oss-120b는 strict 지원"],
      ["제한 시간과 재시도", "timeout 5초, SDK max_retries 0", "SDK 기본은 60초, 2회 재시도라 반드시 바꿈"],
    ] });
  listBox(slide, { x: X0 + wL + GAP, y: BODY_TOP, w: CW - wL - GAP, title: "주의", label: "주의", fit: { bottom: BODY_BOTTOM, maxSize: 16 }, items: [
    "출력 약 500 tps 기준 5초면 약 2,500 토큰까지임. 4096 상한까지 길게 쓰면 타임아웃(실측 필요)",
    "무료 플랜 표 기준 분당 8천 토큰이라 프롬프트 약 2,500 토큰이면 분당 3회 정도만 가능 → 계정 한도 확인 필요",
    "logprobs, logit_bias, messages[].name은 넣으면 400 오류",
  ] });
  sourceLine(slide, "출처: console.groq.com/docs/api-reference, /docs/reasoning, /docs/structured-outputs, /docs/rate-limits (2026-10-15)");
}

async function createSlide25() {
  const slide = newSlide("C-01 시스템 프롬프트 섹션별 요약",
    "시스템 프롬프트는 프롬프트 가이드의 섹션 구조로 쓰고, 전문은 스크립트 부록 A에 둠");
  dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [1.8, 13.1], minRowH: 0.6, boldFirstCol: true, fit: { bottom: BODY_BOTTOM, maxSize: 18 },
    label: "프롬프트 요약", header: ["섹션", "요약"], rows: [
      ["[목표]", "상담사 질문을 정형쿼리 선택 또는 PostgreSQL SELECT 한 문장 계획으로 바꿈"],
      ["[역할]", "카드사 정형 DB와 NL2SQL 경력 8년의 데이터 엔지니어. 허용 범위를 넘는 SQL은 만들지 않음"],
      ["[맥락]", "회원 범위는 DB가 세션 변수로 이미 거름. 기준일과 거래 제공 시작일이 정해져 있음"],
      ["[입력]", "공개 뷰 7개와 컬럼 설명, 정형쿼리 8개, 유저 프롬프트의 질문과 재시도 사유"],
      ["[처리]", "정형쿼리로 답할 수 있으면 FIXED 우선 → 아니면 NL2SQL → 뷰 범위 밖이면 UNANSWERABLE"],
      ["[출력]", "route, query_id, sql, target_views, requested_period, reason 6개 필드 JSON"],
      ["[제약조건]", "회원 조건과 세션 변수를 SQL에 쓰지 않음. app 뷰 7개와 허용 함수만, SELECT 한 문장"],
      ["[예시]", "정형쿼리 선택 1개, NL2SQL 1개, 답할 수 없음 1개"],
    ] });
}

async function createSlide26() {
  const slide = newSlide("C-01 유저 프롬프트와 응답 데이터 구조",
    "유저 프롬프트는 XML 태그로 값을 감싸고, 응답은 strict JSON Schema로 6개 필드를 강제함");
  let y = darkBadge(slide, { x: X0, y: BODY_TOP, w: 2.6, text: "유저 프롬프트 변수" });
  const yA = dataTable(slide, { x: X0, y: y + 0.1, w: HALF, colW: [1.7, 1.0, 2.6, 2.0], label: "유저 프롬프트", fit: { bottom: BODY_BOTTOM - 0.7, maxSize: 16 },
    header: ["이름", "타입", "설명", "필수 여부"], rows: [
      ["question", "string", "가린 질문(masked_question)", "필수"],
      ["base_date", "date", "조회 기준일", "필수"],
      ["coverage_start", "date", "거래 제공 시작일", "필수"],
      ["attempt", "integer", "몇 번째 계획인지(1 또는 2)", "필수"],
      ["retry_reason", "string", "앞 계획이 거절된 사유 코드", "선택(첫 회 \"없음\")"],
      ["previous_sql", "string", "검증에 실패한 SQL", "선택(첫 회 \"없음\")"],
    ] });
  y = darkBadge(slide, { x: X0 + HALF + GAP, y: BODY_TOP, w: 2.6, text: "응답 데이터 구조" });
  const yB = dataTable(slide, { x: X0 + HALF + GAP, y: y + 0.1, w: HALF, colW: [1.9, 1.6, 3.8], label: "응답 구조", fit: { bottom: BODY_BOTTOM - 0.7, maxSize: 16 },
    header: ["이름", "타입", "설명"], rows: [
      ["route", "string", "FIXED, NL2SQL, UNANSWERABLE 중 하나"],
      ["query_id", "string 또는 null", "FIXED일 때 FQ-01 ~ FQ-08"],
      ["sql", "string 또는 null", "NL2SQL일 때 SELECT 한 문장"],
      ["target_views", "array(string)", "읽으려는 뷰 이름(허용 뷰 7개 중)"],
      ["requested_period", "object", "from, to(date 또는 null). 질문이 말한 기간"],
      ["reason", "string", "판단 이유 한 문장(한국어)"],
    ] });
  caption(slide, { y: Math.max(yA, yB) + 0.25,
    text: "strict 모드는 모든 필드가 required이고 선택 값은 null 허용 타입으로 둠(Structured Outputs 문서)" });
}

// ---------------------------------------------------------------------------
// 슬라이드 27 ~ 28: ⑥ 남은 시간 예산 정책
// ---------------------------------------------------------------------------
async function createSlide27() {
  const slide = newSlide("⑥ 남은 시간 예산 정책: 측정 시점과 계산식",
    "단계를 시작하기 전마다 실제로 흐른 시간을 재서, 남은 예산이 0.75초 이상일 때만 시작함");
  let y = darkBadge(slide, { x: X0, y: BODY_TOP, w: 1.6, text: "계산식" });
  y = dataTable(slide, { x: X0, y: y + 0.1, w: CW, colW: [2.2, 6.6, 6.1], size: 15, minRowH: 0.38, boldFirstCol: true,
    label: "계산식", header: ["이름", "계산식", "이 워크플로우 값"], rows: [
      ["남은 시간", "전체 시간 예산 - 기존 사용 시간 - 종료 처리 시간", "15 - 기존 사용 시간 - 1"],
      ["남은 시간 예산", "남은 시간 - SUM(앞으로 남은 단계의 외부 연동 최악값)", "남은 시간 - (아래 차감값)"],
      ["시작 기준 시간", "전체 시간 예산 × 5%", "15 × 0.05 = 0.75초"],
      ["시작 조건", "남은 시간 예산 ≥ 시작 기준 시간", "남은 시간 예산 ≥ 0.75초"],
    ] });
  y = darkBadge(slide, { x: X0, y: y + 0.2, w: 2.6, text: "측정 시점별 차감값" });
  y = dataTable(slide, { x: X0, y: y + 0.1, w: CW, colW: [4.6, 10.3], size: 15, minRowH: 0.36, boldFirstCol: true,
    label: "차감값", header: ["측정 시점", "차감하는 외부 연동 최악값"], rows: [
      ["S-R1 시작 전", "S-R2 5초 = 5초"],
      ["S-R2 시작 전(1차, 재시도)", "S-R2 5초 = 5초(반복 구간 안이라 1회분만)"],
      ["S-R3, S-R4 시작 전(attempt 1)", "되돌아갈 경로의 S-R2 5초 = 5초(분기 중 가장 큰 경로)"],
      ["S-R3, S-R4 시작 전(attempt 2)", "0초(더 돌아갈 일이 없음)"],
      ["S-R5, S-R6 시작 전", "0초"],
    ] });
  caption(slide, { y: y + 0.15, text: "기존 사용 시간은 started_at부터 실제로 흐른 시간(측정값). S-R5는 statement_timeout을 이 시점 남은 시간 예산 이하로 둠" });
}

async function createSlide28() {
  const slide = newSlide("⑥ 남은 시간 예산 정책: 계산 예와 착지 단계",
    "느려진 요청은 LLM 재시도를 하지 않고 키워드 규칙으로 바꾸어 15초를 지킴");
  const wL = 6.4;
  codeBox(slide, { x: X0, y: BODY_TOP, w: wL, size: 14, label: "계산 예", lines: [
    "전체 시간 예산 15초 / 종료 처리 1초 / 시작 기준 0.75초",
    "[예 1] S-R2 1차 시작 전, 기존 사용 0.4초",
    "  남은 시간 = 15 - 0.4 - 1 = 13.6초",
    "  남은 시간 예산 = 13.6 - 5 = 8.6초 ≥ 0.75 → 시작",
    "[예 2] S-R2 재시도 시작 전, 기존 사용 6.2초",
    "  남은 시간 = 15 - 6.2 - 1 = 7.8초",
    "  남은 시간 예산 = 7.8 - 5 = 2.8초 ≥ 0.75 → 시작",
    "[예 3] S-R2 재시도 시작 전, 기존 사용 9.6초",
    "  남은 시간 = 15 - 9.6 - 1 = 4.4초",
    "  남은 시간 예산 = 4.4 - 5 = -0.6초 < 0.75",
    "  → 착지(키워드 규칙)",
    "[예 4] S-R5 시작 전, 기존 사용 11.3초",
    "  남은 시간 = 15 - 11.3 - 1 = 2.7초",
    "  남은 시간 예산 = 2.7 - 0 = 2.7초 ≥ 0.75 → 시작",
    "  statement_timeout = 2,700ms 이하",
  ] });
  const xR = X0 + wL + GAP;
  const y = darkBadge(slide, { x: xR, y: BODY_TOP, w: 3.6, text: "기준 미달 시 단계별 착지" });
  dataTable(slide, { x: xR, y: y + 0.1, w: CW - wL - GAP, colW: [1.2, 3.6, 3.7], boldFirstCol: true, fit: { bottom: BODY_BOTTOM, maxSize: 16 },
    label: "착지 표", header: ["단계", "착지", "판단 이유"], rows: [
      ["S-R1", "안전 종료(TIME_BUDGET_EXCEEDED)", "시작 직후라 실제로는 거의 없음"],
      ["S-R2", "대체 경로(키워드 규칙 정형쿼리) → 없으면 안전 종료", "LLM 없이도 정형쿼리는 고를 수 있음"],
      ["S-R3, S-R4", "재시도를 끄고 차감값 0초로 다시 계산 → 그래도 미달이면 안전 종료", "재시도 없이 끝날 수 있는 요청을 살림"],
      ["S-R5", "안전 종료(TIME_BUDGET_EXCEEDED)", "DB 결과 없이는 낼 결과가 없음"],
      ["S-R6", "착지 없음, 항상 실행", "종료 처리 시간 1초를 미리 떼어 둠"],
    ] });
}

// ---------------------------------------------------------------------------
// 슬라이드 29 ~ 35: 부록
// ---------------------------------------------------------------------------
async function createSlide29() {
  const slide = newSlide("부록: 논리 뷰 목록", "NL2SQL 계정이 읽을 수 있는 뷰는 9개이고, 그중 공개 뷰 7개만 LLM에 보여 주고 SQL에 허용함");
  const y = dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [4.2, 7.0, 1.2, 2.5], minRowH: 0.4, fit: { bottom: BODY_BOTTOM - 0.5, maxSize: 16 },
    label: "뷰 목록", header: ["뷰", "담는 내용", "컬럼 수", "NL2SQL 허용"], rows: [
      ["app.customer_profile", "가입일, 연령대(기준일 이전 가입만)", "2", "허용"],
      ["app.customer_cards", "보유 카드(card_ref 가명 번호), 상품, 브랜드, 발급일, 상태, 연회비", "9", "허용"],
      ["app.monthly_usage", "카드별 월 승인 사용액과 건수, 최근 6개월", "6", "허용"],
      ["app.merchant_usage", "카드별 월별 가맹점, 업종 승인 사용액, 최근 6개월", "10", "허용"],
      ["app.customer_delinquency", "기준일 이전 완료월 중 가장 최근 연체 1건", "5", "허용"],
      ["app.customer_delinquency_history", "최근 완료월 기준 12개월 연체 이력", "5", "허용"],
      ["app.customer_daily_usage", "최근 90일 일별 승인 사용액과 건수(전체 카드 합)", "3", "허용"],
      ["app_internal.customer_cards_full", "원본 카드ID 포함 조립용 뷰", "10", "금지(위험 R-01)"],
      ["app_internal.member_basic", "회원ID, 가입일(S-R1 회원 확인 전용)", "3", "금지(서비스 코드만)"],
    ] });
  caption(slide, { y: y + 0.15, text: "세션 변수 app.member_id(행 수준 보안), app.base_date, app.coverage_start를 트랜잭션 안에서 지정해야 행이 보임" });
  sourceLine(slide, "근거: work/db_catalog.json(sql_retriever_user, 2026-10-15 실행), rdb/init/04 ~ 06 SQL");
}

async function createSlide30() {
  const slide = newSlide("부록: 정형쿼리 목록", "정형쿼리 8개는 모두 NL2SQL 계정으로 EXPLAIN을 통과했고, LLM 실패 시 키워드 규칙으로도 고름");
  const y = dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [1.3, 3.8, 2.1, 4.6, 3.1], minRowH: 0.42, fit: { bottom: BODY_BOTTOM - 0.5, maxSize: 16 },
    label: "정형쿼리", header: ["고정 조회ID", "설명", "결과 단위", "대체 경로 키워드(설계 가정)", "EXPLAIN"], rows: [
      ["FQ-01", "고객 기본 정보", "회원 1행", "가입일, 연령", "통과"],
      ["FQ-02", "보유 카드 목록", "카드 1장당 1행", "보유 카드, 카드 목록, 연회비", "통과"],
      ["FQ-03", "카드별 월 사용액(최근 6개월)", "카드별 월 1행", "카드별 + 월 또는 사용", "통과"],
      ["FQ-04", "월 사용액 합계(전체 카드)", "월 1행", "월별, 월 사용, 지난달, 이번 달", "통과"],
      ["FQ-05", "업종별 사용액(최근 6개월)", "업종 1행", "업종, 가맹점, 어디서", "통과"],
      ["FQ-06", "최근 연체 현황", "회원 1행", "연체(이력 표현 없음)", "통과"],
      ["FQ-07", "연체 이력(최근 12개월)", "월 1행", "연체 + 이력, 내역, 12개월", "통과"],
      ["FQ-08", "일별 사용액(최근 90일)", "일 1행", "일별, 날짜별, 90일", "통과(비용 큼, 실측 필요)"],
    ] });
  caption(slide, { y: y + 0.15, text: "SQL 전문은 스크립트 부록 B. 키워드 규칙은 위에서부터 차례로 맞춰 처음 맞는 1개를 씀" });
  sourceLine(slide, "근거: work/explain_fixed_queries.log(sql_retriever_user, 읽기 전용 세션, 2026-10-15)");
}

async function createSlide31() {
  const slide = newSlide("부록: SQL 검증 규칙", "허용 목록에 있는 것만 통과시키는 방식(기본 거부)으로 검사함");
  const y = twoColumns(slide, {
    left: { title: "허용", items: [
      "뷰: app 스키마 7개(부록 논리 뷰 목록). 스키마 이름을 붙여 씀",
      "컬럼: 뷰마다 db_catalog.json의 컬럼 전체",
      "구문: SELECT 한 문장, WITH, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, 허용 뷰끼리의 JOIN, 서브쿼리",
      "함수: count, sum, avg, min, max, date_trunc, to_char, extract, coalesce, round, greatest, least, abs, 형변환",
      "결과 행 상한: LIMIT 200(없으면 붙이고, 크면 낮춤)",
    ] },
    right: { title: "금지", items: [
      "쓰기와 구조 변경: INSERT, UPDATE, DELETE, MERGE, CREATE, ALTER, DROP, TRUNCATE, GRANT, REVOKE, COPY",
      "여러 문장(;), 주석(-- 또는 /* */), FOR UPDATE 또는 FOR SHARE, SELECT INTO",
      "함수: set_config, current_setting, pg_로 시작하는 함수, generate_series, pg_sleep",
      "스키마: app_internal, public, pg_catalog, information_schema",
    ] }, bottom: BODY_BOTTOM - 0.55,
  });
  caption(slide, { y: y + 0.2, text: "사용자 결정 D-05(2026-10-15). DB 권한이 아니라 검사 규칙으로 막는 항목이 있으므로 위험 R-01 참고" });
}

const FIELDS = [
  ["request_id", "요청 추적 ID", "string", "트리거"],
  ["question", "상담사 질문 원문", "string", "트리거"],
  ["member_id", "회원ID", "string", "트리거"],
  ["masked_question", "식별자를 가린 질문", "string", "S-R1"],
  ["masked_count", "가린 개수", "integer", "S-R1"],
  ["base_date", "조회 기준일", "date", "S-R1"],
  ["coverage_start", "거래 제공 시작일", "date", "S-R1"],
  ["started_at", "워크플로우 시작 시각", "datetime", "S-R1"],
  ["attempt", "계획 시도 횟수", "integer", "S-R1(0), S-R2(+1)"],
  ["plan", "LLM 계획", "object", "S-R2"],
  ["plan_source", "계획 출처(LLM 또는 키워드 규칙)", "string", "S-R2"],
  ["verdict", "계획 판정 결과", "string", "S-R3"],
  ["candidate_sql", "검증할 SQL", "string", "S-R3"],
  ["sql_source", "SQL 출처(정형쿼리 또는 NL2SQL)", "string", "S-R3"],
  ["query_id", "정형쿼리ID", "string", "S-R3"],
  ["retry_reason", "재계획 사유 코드", "string", "S-R3, S-R4"],
  ["unanswerable_reason", "답할 수 없는 이유", "string", "S-R3"],
  ["validated_sql", "검증 통과 SQL", "string", "S-R4"],
  ["row_limit", "결과 행 상한", "integer", "S-R4"],
  ["previous_sql", "검증 실패 SQL", "string", "S-R4"],
  ["columns, rows, row_count, truncated, db_elapsed_ms", "실행 결과", "array, array, integer, boolean, integer", "S-R5"],
  ["status, route, message, elapsed_ms", "응답 상태, 경로, 안내 문장, 전체 처리 시간", "string, string, string, integer", "S-R6"],
];
async function createSlide32() {
  const slide = newSlide("부록: 필드 영문명", "단계 사이에 오가는 필드의 영문명과 한글 뜻을 한곳에 모음");
  const head = ["영문명", "한글 뜻", "타입", "처음 만드는 단계"];
  const left = FIELDS.slice(0, 11), right = FIELDS.slice(11);
  dataTable(slide, { x: X0, y: BODY_TOP, w: HALF, colW: [2.4, 2.6, 1.1, 1.3], header: head, rows: left, fit: { bottom: BODY_BOTTOM, maxSize: 16 },
    minRowH: 0.34, label: "필드 왼쪽" });
  dataTable(slide, { x: X0 + HALF + GAP, y: BODY_TOP, w: HALF, colW: [2.4, 2.4, 1.4, 1.2], header: head, rows: right,
    fit: { bottom: BODY_BOTTOM, maxSize: 16 }, minRowH: 0.34, label: "필드 오른쪽" });
}

async function createSlide33() {
  const slide = newSlide("부록: 오류 응답", "오류 응답에는 SQL, DB 식별자, 접속 정보, 키를 넣지 않고, 다시 시도해도 되는지만 알려 줌");
  let y = dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [3.2, 1.3, 2.4, 6.3, 1.7], minRowH: 0.4, fit: { bottom: BODY_BOTTOM - 1.25, maxSize: 16 },
    label: "오류 응답", header: ["오류 코드", "HTTP 상태", "발생 단계", "의미", "다시 시도"], rows: [
      ["INVALID_REQUEST", "400", "S-R1", "필수 필드 누락, 형식 오류, 기준일 오류", "아니요"],
      ["MEMBER_NOT_FOUND", "404", "S-R1", "회원이 없거나 기준일에 가입 전", "아니요"],
      ["LLM_UNAVAILABLE", "503", "S-R2", "LLM 실패 + 키워드 규칙에도 맞는 정형쿼리 없음", "예"],
      ["SQL_VALIDATION_FAILED", "422", "S-R4", "재생성 후에도 SQL이 검증 규칙 위반", "아니요"],
      ["DB_TIMEOUT", "504", "S-R5", "실행 제한 시간 초과", "예"],
      ["DB_ERROR", "500", "S-R1, S-R5", "DB 접속 또는 조회 오류", "예"],
      ["TIME_BUDGET_EXCEEDED", "504", "모든 단계 시작 전(⑥)", "남은 시간 예산이 시작 기준 미달", "예"],
      ["INTERNAL_ERROR", "500", "S-R6", "응답 구성 실패", "예"],
    ] });
  y = codeBox(slide, { x: X0, y: y + 0.2, w: CW, size: 14, label: "오류 형식", lines: [
    "{ request_id(string), status(\"ERROR\"), error_code(string), message(string, 한국어 안내), retryable(boolean) }",
  ] });
  caption(slide, { y: y + 0.1, text: "메시지 예: \"질문을 처리할 데이터 조회 문장을 만들지 못했습니다. 질문을 바꿔 다시 요청해 주세요.\"" });
}

async function createSlide34() {
  const slide = newSlide("부록: 설계 점검표", "설계 가이드 5절 점검표를 이 설계서에 그대로 대어 본 결과임");
  dataTable(slide, { x: X0, y: BODY_TOP, w: CW, colW: [10.9, 4.0], minRowH: 0.38, fit: { bottom: BODY_BOTTOM, maxSize: 18 }, label: "점검표",
    header: ["점검 항목", "결과"], rows: [
      ["단계ID 접두어가 트리거 유형(S-R)과 맞음", "통과"],
      ["입력과 출력이 필드 단위이고, 입력의 출처 단계가 그 필드를 출력함", "통과"],
      ["외부시스템이 \"없음\"이 아닌 단계(S-R2)가 연동 명세에 있음", "통과"],
      ["연동 명세의 커넥터ID(C-01)가 커넥터 목록에 있음", "통과"],
      ["연동 최악값 = 타임아웃 × (1 + 재시도)", "통과(5 × 1 = 5초)"],
      ["초과 시 처리와 착지를 부분결과 → 대체 경로 → 안전 종료 순서로 검토함", "통과"],
      ["반복 구간 최악값 = 구간 합계 × (1 + 재시도)", "통과((5 + 0 + 0) × 2 = 10초)"],
      ["최악값 합계에서 분기는 가장 큰 경로만 더함", "통과"],
      ["최악값 합계 ≤ 전체 시간 예산", "통과(10초 ≤ 15초)"],
      ["재개 방안이 해당없음 또는 단계별 결과 저장", "통과(해당없음)"],
      ["LLM 커넥터 필수 항목이 모두 채워짐", "통과"],
      ["시스템 프롬프트가 프롬프트 가이드 섹션 구조를 따름", "통과(부록 A)"],
    ] });
}

async function createSlide35() {
  const slide = newSlide("부록: 설계 가정과 위험 항목", "아래 항목은 개발 후 실측하거나 권한을 고쳐서 닫아야 함");
  twoColumns(slide, {
    left: { title: "설계 가정(실측으로 확인)", items: [
      "LLM 타임아웃 5초, temperature 0.2, reasoning_effort low",
      "DB 조회와 규칙 처리가 여유 4초 안에 듦(특히 FQ-08)",
      "시작 기준 비율 5%(설계 가이드 기본값)",
      "member_id 형식, 질문 500자 상한, 키워드 규칙표, lab_metadata 키 이름",
      "출력 4096 토큰 상한에서도 5초 안에 응답함",
    ] },
    right: { title: "위험 항목", items: [
      "R-01: NL2SQL 계정이 app_internal 뷰 2개(원본 카드ID, 회원ID)를 SELECT 할 수 있음 → 서비스용 계정과 NL2SQL 계정을 나누는 권한 정리 권장",
      "R-02: NL2SQL 계정이 원본 테이블 public.lab_metadata를 읽을 수 있음(메타데이터라 영향 낮음)",
      "R-03: Groq 무료 플랜 표 기준 분당 8천 토큰 → 실제 계정 한도 확인 필요",
      "R-04: 이름처럼 정규식으로 못 잡는 식별자가 외부 LLM으로 나갈 수 있음",
    ] },
  });
}

// ---------------------------------------------------------------------------
// 6-11 진입점
// ---------------------------------------------------------------------------
async function main() {
  pptx = new pptxgen();
  pptx.defineLayout({ name: "CUSTOM", width: 16, height: 9 });
  pptx.layout = "CUSTOM";
  pptx.title = "SQL 검색기 워크플로우 설계서";
  pptx.author = "design-agentic-ai";
  defineContentLayout(pptx);

  const fns = [createSlide01, createSlide02, createSlide03, createSlide04, createSlide05, createSlide06, createSlide07,
    ...STEPS.flatMap(stepSlides),
    createSlide20, createSlide21, createSlide22, createSlide23, createSlide24, createSlide25, createSlide26,
    createSlide27, createSlide28, createSlide29, createSlide30, createSlide31, createSlide32, createSlide33,
    createSlide34, createSlide35];
  for (const fn of fns) await fn(pptx);

  await pptx.writeFile({ fileName: OUT_PPTX });
  fs.writeFileSync(OUT_EDGES, JSON.stringify(FLOW_EDGES, null, 2), "utf8");
  console.log(`✅ PPT 생성 완료: ${OUT_PPTX} (${fns.length}장)`);
}

main().catch((e) => { console.error("❌ PPT 생성 실패:", e.message || e); process.exit(1); });
