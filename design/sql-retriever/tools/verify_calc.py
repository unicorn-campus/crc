"""설계서 스크립트에 적힌 수치를 다시 계산하고, 단계 연결(이전 단계, Mermaid, PPT 도식)이 서로 같은지 대조하는 도구.

왜 필요한가: 표의 최악값과 계산 예는 손으로 옮겨 적으므로, 숫자 하나만 어긋나도 시간 예산 판단이 틀어짐.

사용 예:
    python verify_calc.py --md ../sql_retriever_워크플로우설계서.md [--deck-edges ../build/flow_edges.json]

종료 코드: 0 전부 일치, 1 불일치 있음
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TOTAL, FINALIZE, START_RATIO = 15, 1, 0.05


def check(results: list[tuple[bool, str]], ok: bool, label: str) -> None:
    results.append((ok, label))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--md", type=Path, required=True)
    parser.add_argument("--deck-edges", type=Path)
    args = parser.parse_args()
    md = args.md.read_text(encoding="utf-8")
    results: list[tuple[bool, str]] = []

    # 1) 연동 최악값 = 타임아웃 × (1 + 재시도)
    m = re.search(r"`S-R2` \| Groq LLM API\(openai/gpt-oss-120b\) \| LLM \| `C-01` \| (\d+)초\(설계 가정\) \| (\d+) \| "
                  r"(\d+) × \(1 \+ (\d+)\) = (\d+)초", md)
    timeout, retry, t2, r2, worst = map(int, m.groups())
    check(results, (timeout, retry) == (t2, r2) and worst == timeout * (1 + retry),
          f"연동 최악값 S-R2: {timeout} × (1 + {retry}) = {timeout * (1 + retry)} / 표 {worst}")

    # 2) 반복 구간 최악값 = (구간 단계 최악값 합계) × (1 + 재시도)
    m = re.search(r"\| `S-R2 ~ S-R4` \| (\d+) \|\s*\n?\s*\((\d+) \+ (\d+) \+ (\d+)\) × \(1 \+ (\d+)\) = (\d+)초", md)
    loop_retry, a, b, c, lr2, loop_worst = map(int, m.groups())
    check(results, a == worst and (b, c) == (0, 0) and loop_retry == lr2
          and loop_worst == (a + b + c) * (1 + loop_retry),
          f"반복 구간 L-1: ({a} + {b} + {c}) × (1 + {loop_retry}) = {(a + b + c) * (1 + loop_retry)} / 표 {loop_worst}")

    # 3) 최악값 합계(분기는 가장 큰 경로만) ≤ 전체 시간 예산
    m = re.search(r"최악값 합계 \| S-R1 (\d+)초 \+ L-1 (\d+)초 \+ S-R5 (\d+)초 \+ S-R6 (\d+)초 = (\d+)초 \(≤ (\d+)초\)", md)
    s1, l1, s5, s6, total_worst, budget = map(int, m.groups())
    main_path = s1 + l1 + s5 + s6
    unanswerable_path = s1 + l1 + s6  # S-R3 → S-R6 분기는 S-R4, S-R5를 건너뜀
    check(results, l1 == loop_worst and total_worst == max(main_path, unanswerable_path) and budget == TOTAL
          and total_worst <= TOTAL,
          f"최악값 합계: max(본 경로 {main_path}, 답할 수 없음 경로 {unanswerable_path}) = {max(main_path, unanswerable_path)}"
          f" / 표 {total_worst} ≤ 예산 {TOTAL}")
    check(results, "15 - 10 = 5초 = 종료 처리 1초 + DB 조회와 규칙 처리 4초" in md and TOTAL - total_worst - FINALIZE == 4,
          f"여유 시간: {TOTAL} - {total_worst} - {FINALIZE} = {TOTAL - total_worst - FINALIZE}초")

    # 4) 남은 시간 예산 계산 예
    start_basis = TOTAL * START_RATIO
    check(results, f"15 × 0.05 = {start_basis}초" in md, f"시작 기준 시간 = {start_basis}초")
    examples = re.findall(r"남은 시간 = 15 - ([\d.]+) - 1 = ([\d.]+)초\s*\n\s*남은 시간 예산 = ([\d.]+) - (\d+) = (-?[\d.]+)초 "
                          r"(≥|<) 0\.75", md)
    check(results, len(examples) == 4, f"계산 예 개수 {len(examples)}개(기대 4개)")
    for used, remain, remain2, deduct, budget_left, op in examples:
        r = round(TOTAL - float(used) - FINALIZE, 2)
        b_left = round(r - int(deduct), 2)
        ok = (abs(r - float(remain)) < 1e-9 and remain == remain2 and abs(b_left - float(budget_left)) < 1e-9
              and (op == "≥") == (b_left >= start_basis))
        check(results, ok, f"계산 예(기존 사용 {used}초): 남은 시간 {r}, 예산 {b_left} {'≥' if b_left >= start_basis else '<'} {start_basis}")
    check(results, "statement_timeout = 2,700ms 이하" in md, "예 4의 statement_timeout = 2.7초 = 2,700ms")

    # 5) 단계 연결: 단계별 명세의 이전 단계 ↔ Mermaid 화살표
    mermaid = re.search(r"```mermaid\n(.*?)```", md, re.S).group(1)
    edges = set()
    # 실선(-->)과 점선(-.->) 화살표를 모두 읽음
    for src, dst in re.findall(r"\b(T|R\d)\b[^\n]*?(?:--|-\.)[^\n]*?>\s*(R\d|E\d)\b", mermaid):
        edges.add((src, dst))
    preds_mermaid: dict[str, set[str]] = {}
    for src, dst in edges:
        if dst.startswith("R"):
            preds_mermaid.setdefault(dst, set()).add("트리거" if src == "T" else src)
    preds_spec: dict[str, set[str]] = {}
    for sid, prev in re.findall(r"단계ID \| `S-(R\d)`\s*\n\s*- 단계명 \| [^\n]*\n\s*- 이전 단계 \| ([^\n]*)", md):
        names = set(re.findall(r"S-(R\d)", prev))
        preds_spec[sid] = names or ({"트리거"} if "트리거" in prev else set())
    for sid in sorted(preds_spec):
        check(results, preds_spec[sid] == preds_mermaid.get(sid, set()),
              f"{sid} 이전 단계 {sorted(preds_spec[sid])} ↔ Mermaid {sorted(preds_mermaid.get(sid, set()))}")

    # 6) PPT 도식 화살표 ↔ Mermaid (빌드 후에만)
    if args.deck_edges:
        deck = {tuple(e) for e in json.loads(args.deck_edges.read_text(encoding="utf-8"))}
        check(results, deck == edges, f"PPT 도식 화살표 {len(deck)}개 ↔ Mermaid {len(edges)}개 "
              f"(PPT에만 {sorted(deck - edges)}, Mermaid에만 {sorted(edges - deck)})")

    for ok, label in results:
        print(f"[{'통과' if ok else '불일치'}] {label}")
    failed = sum(1 for ok, _ in results if not ok)
    print(f"합계: {len(results)}건 중 통과 {len(results) - failed}건, 불일치 {failed}건")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
