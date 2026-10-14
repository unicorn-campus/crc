"""정형쿼리 후보 SQL을 EXPLAIN으로만 점검하는 도구(문법과 권한 확인용, 데이터 행은 읽지 않음).

사용 예:
    python explain_fixed_queries.py --host localhost --port 5432 --dbname cardlab \
        --user sql_retriever_user --env-file C:/.../hybrid-ai-lab/.env --queries fixed_queries.json

종료 코드: 0 전부 통과, 1 접속 실패, 3 비밀번호 미등록, 4 하나 이상 실패
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

from read_views import read_password


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--dbname", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--queries", type=Path, required=True)
    args = parser.parse_args()

    password = read_password(args.env_file)
    if password is None:
        print(f"[중단] {args.env_file}에 RDB_PASSWORD가 없거나 비어 있음")
        return 3
    queries = json.loads(args.queries.read_text(encoding="utf-8"))

    try:
        conn = psycopg.connect(host=args.host, port=args.port, dbname=args.dbname, user=args.user,
                               password=password, connect_timeout=5,
                               options="-c default_transaction_read_only=on")
    except psycopg.Error as exc:
        print(f"[접속 실패] {type(exc).__name__}: {str(exc).strip()}")
        return 1

    failed = 0
    with conn, conn.cursor() as cur:
        cur.execute("SET default_transaction_read_only = on")
        for q in queries:
            try:
                # EXPLAIN(ANALYZE 없음)은 실행 계획만 만들고 SQL을 실제로 실행하지 않음
                cur.execute("EXPLAIN " + q["sql"])
                plan = [row[0] for row in cur.fetchall()]
                print(f"[통과] {q['id']} {q['name']} — 계획 {len(plan)}줄, 첫 줄: {plan[0].strip()}")
            except psycopg.Error as exc:
                conn.rollback()
                cur.execute("SET default_transaction_read_only = on")
                failed += 1
                print(f"[실패] {q['id']} {q['name']} — {type(exc).__name__}: {str(exc).strip().splitlines()[0]}")
        conn.rollback()
    print(f"합계: {len(queries)}개 중 통과 {len(queries) - failed}개, 실패 {failed}개")
    return 4 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
