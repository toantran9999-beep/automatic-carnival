"""PreToolUse (Write|Edit): chặn sửa file bí mật — .env thật và thư mục "momo key".

Vì sao: repo có .env thật (khoá JWT, mật khẩu DB) ở gốc, apps/*, packages/*.
Sửa nhầm là hỏng đăng nhập/kết nối DB khi deploy; các file mẫu (.env.example)
vẫn sửa được. Cần sửa thật thì anh Toàn tự sửa tay.
"""
import json
import sys
from pathlib import PurePosixPath

MAU = {".env.example", ".env.sample", ".env.template"}


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    raw = (data.get("tool_input") or {}).get("file_path") or ""
    path = PurePosixPath(raw.replace("\\", "/"))
    name = path.name.lower()

    ly_do = None
    if any(p.lower() == "momo key" for p in path.parts):
        ly_do = 'thư mục "momo key" chứa khoá thanh toán'
    elif (name == ".env" or name.startswith(".env.")) and name not in MAU:
        ly_do = f"{path.name} là file bí mật thật (khoá, mật khẩu)"

    if not ly_do:
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": f"Chặn sửa {raw}: {ly_do}. Sửa file mẫu .env.example, "
                                    "hoặc nhờ anh Toàn tự sửa tay.",
    }}))


if __name__ == "__main__":
    main()
