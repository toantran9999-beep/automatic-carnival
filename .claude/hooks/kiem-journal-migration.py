"""PostToolUse (Write|Edit): ghi .sql hoặc _journal.json trong packages/db/drizzle
thì so số file .sql với số mục trong meta/_journal.json.

Vì sao: drizzle chỉ chạy migration CÓ MỤC trong journal. Thêm .sql mà quên journal
thì container migrate vẫn log "thành công" nhưng DB không đổi (quy ước cứng số 5,
~/.claude/toda/core.md). Hook chỉ nhắc, không chặn — giữa lúc viết .sql và sửa
journal lệch 1 là bình thường.
"""
import json
import sys
from pathlib import Path


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    raw = (data.get("tool_input") or {}).get("file_path") or ""
    path = Path(raw.replace("\\", "/"))
    parts = [p.lower() for p in path.parts]

    # Chỉ quan tâm packages/db/drizzle/*.sql và packages/db/drizzle/meta/_journal.json
    if "drizzle" not in parts:
        return
    if not (path.suffix.lower() == ".sql" or path.name == "_journal.json"):
        return
    drizzle = Path(*path.parts[: parts.index("drizzle") + 1])
    journal = drizzle / "meta" / "_journal.json"
    if not journal.is_file():
        return

    sql_tags = {p.stem for p in drizzle.glob("*.sql")}
    try:
        entries = json.loads(journal.read_text(encoding="utf-8")).get("entries", [])
    except Exception as e:
        msg = f"⚠️ Không đọc được {journal}: {e} — journal hỏng thì migrate sẽ không chạy."
        print(json.dumps({"systemMessage": msg, "hookSpecificOutput": {
            "hookEventName": "PostToolUse", "additionalContext": msg}}))
        return
    journal_tags = {e.get("tag") for e in entries}

    thieu_journal = sorted(sql_tags - journal_tags)
    thieu_sql = sorted(t for t in journal_tags - sql_tags if t)
    if not thieu_journal and not thieu_sql:
        return

    dong = [f"⚠️ Migration lệch: {len(sql_tags)} file .sql nhưng journal có {len(journal_tags)} mục."]
    if thieu_journal:
        dong.append("Chưa khai trong meta/_journal.json: " + ", ".join(thieu_journal)
                    + " → thêm mục (idx, version, when, tag, breakpoints) kẻo migrate log 'thành công' mà DB không đổi.")
    if thieu_sql:
        dong.append("Journal trỏ tới file không tồn tại: " + ", ".join(thieu_sql))
    dong.append("Deploy có migration mới: `docker compose build api web migrate` (up -d KHÔNG rebuild migrate).")
    msg = "\n".join(dong)
    print(json.dumps({"systemMessage": msg, "hookSpecificOutput": {
        "hookEventName": "PostToolUse", "additionalContext": msg}}))


if __name__ == "__main__":
    main()
