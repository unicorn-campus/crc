"""NL2SQL 실행 계정으로 DB 구조(뷰, 컬럼, 권한)를 읽어 db_catalog.json으로 저장하는 도구.

왜 스크립트로 두는가: 설계서의 허용 뷰, 컬럼 근거를 언제 다시 돌려도 같은 결과로 재현하기 위함.
데이터 행은 읽지 않음(카탈로그 조회와 `LIMIT 0`만 사용). 세션은 접속 직후 읽기 전용으로 둠.

사용 예:
    python read_views.py --host localhost --port 5432 --dbname cardlab --user sql_retriever_user \
        --env-file C:/.../hybrid-ai-lab/.env --view-sql 04.sql 05.sql 06.sql --out db_catalog.json

종료 코드: 0 정상, 1 접속 실패, 2 관리자 권한 계정, 3 비밀번호 미등록
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import psycopg
from psycopg import sql

ADMIN_FLAGS = ("rolsuper", "rolcreaterole", "rolcreatedb", "rolbypassrls")
SYSTEM_SCHEMAS = ("pg_catalog", "information_schema", "pg_toast")


def read_password(env_file: Path) -> str | None:
    """`.env`에서 RDB_PASSWORD 값만 꺼냄. 값은 화면과 로그에 남기지 않음."""
    if not env_file.is_file():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() == "RDB_PASSWORD":
            value = value.strip().strip('"').strip("'")
            return value or None
    return None


def views_in_sql_files(paths: list[Path]) -> list[str]:
    """View 생성 SQL 파일에서 `CREATE [OR REPLACE] VIEW 스키마.이름`을 모음."""
    pattern = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([\w.]+)", re.IGNORECASE)
    names: set[str] = set()
    for path in paths:
        names.update(pattern.findall(path.read_text(encoding="utf-8")))
    return sorted(names)


def fetch_all(cur: psycopg.Cursor, query: str, params: tuple = ()) -> list[dict]:
    cur.execute(query, params)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--dbname", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--view-sql", type=Path, nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    password = read_password(args.env_file)
    if password is None:
        print(f"[중단] {args.env_file}에 RDB_PASSWORD가 없거나 비어 있음")
        return 3

    try:
        # 접속 옵션에서 먼저 읽기 전용을 걸어, 아래 SET 이전의 어떤 문장도 쓰기가 되지 않게 함
        conn = psycopg.connect(
            host=args.host, port=args.port, dbname=args.dbname, user=args.user,
            password=password, connect_timeout=5,
            options="-c default_transaction_read_only=on",
        )
    except psycopg.Error as exc:
        # 오류 문구에 비밀번호가 들어가지 않으므로 그대로 보여 줌
        print(f"[접속 실패] {type(exc).__name__}: {str(exc).strip()}")
        return 1

    with conn, conn.cursor() as cur:
        cur.execute("SET default_transaction_read_only = on")
        cur.execute("SHOW default_transaction_read_only")
        read_only = cur.fetchone()[0]
        cur.execute("SELECT current_user, version()")
        current_user, server_version = cur.fetchone()

        # 1) 관리자 권한 점검 — 하나라도 있으면 설계 근거로 쓸 수 없는 계정임
        role = fetch_all(cur, f"SELECT {', '.join(ADMIN_FLAGS)} FROM pg_roles WHERE rolname = current_user")[0]
        admin_flags = [k for k in ADMIN_FLAGS if role[k]]
        if admin_flags:
            print(f"[중단] 관리자 권한 보유 계정: {current_user} {admin_flags}")
            return 2

        # 2) 이 계정이 SELECT 가능한 뷰 목록과 설명
        views = fetch_all(cur, """
            SELECT n.nspname AS schema, c.relname AS name,
                   obj_description(c.oid, 'pg_class') AS comment,
                   pg_get_userbyid(c.relowner) AS owner,
                   coalesce(array_to_string(c.reloptions, ','), '') AS options
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('v', 'm')
              AND n.nspname <> ALL(%s) AND n.nspname NOT LIKE 'pg_temp%%'
              AND has_schema_privilege(current_user, n.oid, 'USAGE')
              AND has_table_privilege(current_user, c.oid, 'SELECT')
            ORDER BY 1, 2
        """, (list(SYSTEM_SCHEMAS),))

        # 3) 뷰마다 컬럼 이름과 타입(정의 순서 유지)
        for view in views:
            view["columns"] = fetch_all(cur, """
                SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
                FROM pg_attribute a
                WHERE a.attrelid = to_regclass(%s) AND a.attnum > 0 AND NOT a.attisdropped
                ORDER BY a.attnum
            """, (f"{view['schema']}.{view['name']}",))

        # 4) 뷰 접근 확인 — LIMIT 0이라 데이터 행은 한 건도 오지 않음
        for view in views:
            query = sql.SQL("SELECT * FROM {}.{} LIMIT 0").format(
                sql.Identifier(view["schema"]), sql.Identifier(view["name"]))
            try:
                cur.execute(query)
                view["limit0_ok"] = cur.rowcount == 0
            except psycopg.Error as exc:
                conn.rollback()
                cur.execute("SET default_transaction_read_only = on")
                view["limit0_ok"] = False
                view["limit0_error"] = type(exc).__name__

        # 5) 원본 테이블 SELECT 권한 — NL2SQL 계정이 원본을 읽을 수 있으면 위험 항목임
        base_tables = fetch_all(cur, """
            SELECT n.nspname AS schema, c.relname AS name, c.relrowsecurity AS rls_enabled,
                   obj_description(c.oid, 'pg_class') AS comment
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p')
              AND n.nspname <> ALL(%s)
              AND has_table_privilege(current_user, c.oid, 'SELECT')
            ORDER BY 1, 2
        """, (list(SYSTEM_SCHEMAS),))

        # 6) 스키마 설명과 USAGE 권한
        schemas = fetch_all(cur, """
            SELECT n.nspname AS schema, obj_description(n.oid, 'pg_namespace') AS comment
            FROM pg_namespace n
            WHERE n.nspname <> ALL(%s) AND n.nspname NOT LIKE 'pg_temp%%' AND n.nspname NOT LIKE 'pg_toast%%'
              AND has_schema_privilege(current_user, n.oid, 'USAGE')
            ORDER BY 1
        """, (list(SYSTEM_SCHEMAS),))

        # 7) 행 수준 보안 정책(pg_policies는 모든 계정이 읽을 수 있는 카탈로그 뷰)
        policies = fetch_all(cur, """
            SELECT schemaname AS schema, tablename AS table, policyname AS policy,
                   roles::text AS roles, cmd, qual
            FROM pg_policies ORDER BY 1, 2, 3
        """)

        # 8) 뷰 정의에 쓰인 세션 변수 — 실행 전에 지정해야 데이터가 보이는 값
        defs = fetch_all(cur, """
            SELECT n.nspname || '.' || c.relname AS view, pg_get_viewdef(c.oid) AS def
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'v' AND n.nspname <> ALL(%s)
        """, (list(SYSTEM_SCHEMAS),))
        setting_re = re.compile(r"current_setting\('([\w.]+)'")
        session_settings: dict[str, list[str]] = {}
        for d in defs + [{"view": f"policy:{p['table']}.{p['policy']}", "def": p["qual"] or ""} for p in policies]:
            for name in setting_re.findall(d["def"] or ""):
                session_settings.setdefault(name, []).append(d["view"])
        cur.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE c.relkind IN ('v','m') AND n.nspname <> ALL(%s) "
                    "AND has_schema_privilege(current_user, n.oid, 'USAGE') "
                    "AND has_table_privilege(current_user, c.oid, 'SELECT')", (list(SYSTEM_SCHEMAS),))
        db_view_count = cur.fetchone()[0]
        conn.rollback()

    file_views = views_in_sql_files(args.view_sql)
    db_views = [f"{v['schema']}.{v['name']}" for v in views]
    catalog = {
        "connection": {"db_type": "PostgreSQL", "host": args.host, "port": args.port,
                       "dbname": args.dbname, "user": current_user},
        "server_version": server_version.split(",")[0],
        "session_read_only": read_only,
        "admin_flags": {k: bool(role[k]) for k in ADMIN_FLAGS},
        "view_count": len(views),
        "views": views,
        "schemas_with_usage": schemas,
        "base_tables_with_select": base_tables,
        "rls_policies": policies,
        "session_settings": {k: sorted(set(v)) for k, v in sorted(session_settings.items())},
        "view_sql_files": [p.as_posix() for p in args.view_sql],
        "compare": {
            "only_in_sql_files": sorted(set(file_views) - set(db_views)),
            "only_in_db": sorted(set(db_views) - set(file_views)),
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    saved = json.loads(args.out.read_text(encoding="utf-8"))
    print(f"계정: {current_user} / 관리자 권한: 없음 / 세션 읽기 전용: {read_only}")
    print(f"DB에서 센 접근 가능 뷰 수: {db_view_count}")
    print(f"db_catalog.json 뷰 수: {len(saved['views'])} -> {'일치' if db_view_count == len(saved['views']) else '불일치'}")
    for v in views:
        print(f"  {v['schema']}.{v['name']}: 컬럼 {len(v['columns'])}개, LIMIT 0 {'통과' if v['limit0_ok'] else '실패'}")
    print(f"원본 테이블 SELECT 권한: {[t['schema'] + '.' + t['name'] for t in base_tables] or '없음'}")
    print(f"세션 변수: {list(catalog['session_settings'])}")
    print(f"SQL 파일에만 있는 뷰: {catalog['compare']['only_in_sql_files']}")
    print(f"DB에만 있는 뷰: {catalog['compare']['only_in_db']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
