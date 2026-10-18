"""정형쿼리 FQ-01 ~ FQ-08과 LLM 실패 시 쓰는 키워드 규칙(부록 30장, 부록 B)."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class FixedQuery:
    """검사까지 끝낸 고정 조회 1개."""

    query_id: str
    description: str
    view: str  # 읽는 허용 뷰. S-R3 기간 판정에 씀
    sql: str  # 설계서 부록 B 전문 그대로


# SQL 전문 출처: 설계서 스크립트 「부록 B. 정형쿼리 SQL 전문」(사용자 승인으로 읽음, 2026-10-15)
FIXED_QUERIES: dict[str, FixedQuery] = {
    q.query_id: q
    for q in (
        FixedQuery(
            "FQ-01",
            "고객 기본 정보",
            "app.customer_profile",
            "SELECT join_date, age_band FROM app.customer_profile LIMIT 200",
        ),
        FixedQuery(
            "FQ-02",
            "보유 카드 목록",
            "app.customer_cards",
            "SELECT card_ref, product_name, brand, issue_date, current_status, annual_fee\n"
            "FROM app.customer_cards ORDER BY card_ref LIMIT 200",
        ),
        FixedQuery(
            "FQ-03",
            "카드별 월 사용액(최근 6개월)",
            "app.monthly_usage",
            "SELECT card_ref, month, period_start, period_end, approved_amount, transaction_count\n"
            "FROM app.monthly_usage ORDER BY month, card_ref LIMIT 200",
        ),
        FixedQuery(
            "FQ-04",
            "월 사용액 합계(전체 카드)",
            "app.monthly_usage",
            "SELECT month, sum(approved_amount)::bigint AS approved_amount, "
            "sum(transaction_count)::integer AS transaction_count\n"
            "FROM app.monthly_usage GROUP BY month ORDER BY month LIMIT 200",
        ),
        FixedQuery(
            "FQ-05",
            "업종별 사용액(최근 6개월)",
            "app.merchant_usage",
            "SELECT category, sum(approved_amount)::bigint AS approved_amount, "
            "sum(transaction_count)::integer AS transaction_count\n"
            "FROM app.merchant_usage GROUP BY category ORDER BY approved_amount DESC LIMIT 200",
        ),
        FixedQuery(
            "FQ-06",
            "최근 연체 현황",
            "app.customer_delinquency",
            "SELECT base_month, as_of_date, overdue_amount, overdue_days, overdue_count_12m\n"
            "FROM app.customer_delinquency LIMIT 200",
        ),
        FixedQuery(
            "FQ-07",
            "연체 이력(최근 12개월)",
            "app.customer_delinquency_history",
            "SELECT base_month, as_of_date, overdue_amount, overdue_days, overdue_count_12m\n"
            "FROM app.customer_delinquency_history ORDER BY base_month LIMIT 200",
        ),
        FixedQuery(
            "FQ-08",
            "일별 사용액(최근 90일)",
            "app.customer_daily_usage",
            "SELECT usage_date, approved_amount, transaction_count\n"
            "FROM app.customer_daily_usage ORDER BY usage_date LIMIT 200",
        ),
    )
}


def _any(*words: str) -> Callable[[str], bool]:
    return lambda text: any(word in text for word in words)


_HISTORY_WORDS = ("이력", "내역", "12개월")

# 대체 경로 키워드(30장, 설계 가정 A-4). 위에서부터 차례로 맞춰 처음 맞는 1개를 씀.
# 띄어쓰기는 지우고 비교함(사용자 승인 P-05). 그래서 키워드도 띄어쓰기 없이 적음.
KEYWORD_RULES: tuple[tuple[str, Callable[[str], bool]], ...] = (
    ("FQ-01", _any("가입일", "연령")),
    ("FQ-02", _any("보유카드", "카드목록", "연회비")),
    ("FQ-03", lambda text: "카드별" in text and _any("월", "사용")(text)),
    ("FQ-04", _any("월별", "월사용", "지난달", "이번달")),
    ("FQ-05", _any("업종", "가맹점", "어디서")),
    # FQ-06은 "연체"이되 이력 표현이 없을 때만. 이력 표현이 있으면 아래 FQ-07이 받음
    ("FQ-06", lambda text: "연체" in text and not _any(*_HISTORY_WORDS)(text)),
    ("FQ-07", lambda text: "연체" in text and _any(*_HISTORY_WORDS)(text)),
    ("FQ-08", _any("일별", "날짜별", "90일")),
)

_WHITESPACE = re.compile(r"\s+")


def match_keyword_rule(question: str) -> str | None:
    """키워드 규칙으로 정형쿼리ID 1개를 고름.

    반환값: 처음 맞는 정형쿼리ID. 맞는 규칙이 없으면 None을 반환함.
    """
    text = _WHITESPACE.sub("", question)
    for query_id, rule in KEYWORD_RULES:
        if rule(text):
            return query_id
    return None
