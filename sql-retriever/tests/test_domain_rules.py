"""키워드 규칙(30장), 뷰 제공 기간(04 ~ 06 뷰 정의), 안내 문장 틀(19장)을 확인함."""

from datetime import date

import pytest

from app.domain.fixed_queries import FIXED_QUERIES, match_keyword_rule
from app.domain.messages import result_message, unanswerable_message
from app.domain.periods import is_period_answerable, provision_window

BASE = date(2026, 8, 31)
COVERAGE = date(2025, 8, 1)


# ---------------------------------------------------------------- 키워드 규칙
@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("가입일이 언제인가요", "FQ-01"),
        ("연령대 알려 주세요", "FQ-01"),
        ("보유 카드 보여 주세요", "FQ-02"),
        ("보유카드 몇 장", "FQ-02"),
        ("연회비 얼마예요", "FQ-02"),
        ("카드별 월 사용액", "FQ-03"),
        ("카드별 사용 내역", "FQ-03"),
        ("월별 합계", "FQ-04"),
        ("지난달 얼마 썼나요", "FQ-04"),
        ("이번 달 사용액", "FQ-04"),
        ("업종별로 보여 줘", "FQ-05"),
        ("어디서 많이 썼나요", "FQ-05"),
        ("연체 있나요", "FQ-06"),
        ("연체 이력 보여 줘", "FQ-07"),
        ("최근 12개월 연체", "FQ-07"),
        ("일별 사용액", "FQ-08"),
        ("최근 90일 사용", "FQ-08"),
        ("포인트 잔액", None),
    ],
)
def test_keyword_rule(question, expected):
    assert match_keyword_rule(question) == expected


def test_keyword_rule_uses_first_match():
    """위에서부터 차례로 맞춰 처음 맞는 1개를 씀: "보유 카드"(FQ-02)가 "카드별"(FQ-03)보다 먼저임."""
    assert match_keyword_rule("보유 카드별 월 사용") == "FQ-02"


def test_eight_fixed_queries():
    assert sorted(FIXED_QUERIES) == [f"FQ-0{i}" for i in range(1, 9)]


# ---------------------------------------------------------------- 제공 기간
def test_windows_from_view_definitions():
    assert provision_window("app.monthly_usage", BASE, COVERAGE) == (date(2026, 3, 1), BASE)
    assert provision_window("app.merchant_usage", BASE, COVERAGE) == (date(2026, 3, 1), BASE)
    assert provision_window("app.customer_daily_usage", BASE, COVERAGE) == (date(2026, 6, 3), BASE)
    assert provision_window("app.customer_delinquency_history", BASE, COVERAGE) == (date(2025, 9, 1), BASE)
    assert provision_window("app.customer_profile", BASE, COVERAGE) is None


def test_delinquency_history_uses_previous_month_when_not_month_end():
    assert provision_window("app.customer_delinquency_history", date(2026, 8, 15), COVERAGE) == (
        date(2025, 8, 1),
        date(2026, 7, 31),
    )


def test_coverage_start_limits_monthly_window():
    assert provision_window("app.monthly_usage", BASE, date(2026, 5, 10)) == (date(2026, 5, 1), BASE)


@pytest.mark.parametrize(
    ("views", "period_from", "period_to", "expected"),
    [
        (["app.monthly_usage"], date(2026, 7, 1), date(2026, 7, 31), True),
        (["app.monthly_usage"], date(2025, 12, 1), date(2025, 12, 31), False),  # 6개월 밖
        (["app.customer_daily_usage"], date(2026, 5, 1), None, False),  # 90일 밖
        (["app.customer_daily_usage"], date(2026, 8, 1), None, True),
        (["app.customer_profile"], None, date(2026, 9, 30), False),  # 기준일 이후
        (["app.customer_cards"], date(2020, 1, 1), None, True),  # 기간 제한 없는 뷰
        (["app.monthly_usage"], None, None, True),
    ],
)
def test_period_answerable(views, period_from, period_to, expected):
    assert is_period_answerable(views, period_from, period_to, BASE, COVERAGE) is expected


# ---------------------------------------------------------------- 안내 문장
def test_result_messages():
    assert result_message(BASE, 3, False) == "기준일 2026-08-31 기준 3건"
    assert result_message(BASE, 200, True) == "기준일 2026-08-31 기준 200건, 앞 200건만 보여 줌"
    assert result_message(BASE, 0, False) == "기준일 2026-08-31 기준 해당 데이터 없음"


def test_unanswerable_message_removes_internal_view_names():
    assert unanswerable_message("데이터 제공 기간 밖") == "답할 수 없음: 데이터 제공 기간 밖"
    assert unanswerable_message("포인트는 app.customer_cards 에 없음") == "답할 수 없음: 포인트는 에 없음"
    assert unanswerable_message(None) == "답할 수 없음"
