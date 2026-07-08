"""
DB migration: add priority and bot_type columns to rules table.
Run: python -m migration
"""
import asyncio
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


async def migrate():
    print(f"Migrating {DB_PATH}...")
    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}. Skipping.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if priority column exists
    cursor.execute("PRAGMA table_info(rules)")
    columns = {row[1] for row in cursor.fetchall()}

    if "priority" not in columns:
        print("Adding priority column...")
        cursor.execute("ALTER TABLE rules ADD COLUMN priority INTEGER DEFAULT 999")
    else:
        print("priority column already exists.")

    if "bot_type" not in columns:
        print("Adding bot_type column...")
        cursor.execute("ALTER TABLE rules ADD COLUMN bot_type VARCHAR(20) DEFAULT 'reply'")
    else:
        print("bot_type column already exists.")

    if "dm_template" not in columns:
        print("Adding dm_template column...")
        cursor.execute("ALTER TABLE rules ADD COLUMN dm_template TEXT DEFAULT ''")
    else:
        print("dm_template column already exists.")

    # Set existing reply_template as dm_template for catch_all
    cursor.execute("SELECT id, name, reply_template FROM rules WHERE dm_template IS NULL OR dm_template = ''")
    rows = cursor.fetchall()
    print(f"Found {len(rows)} rules without dm_template")

    # Show current rules and ask user to set priorities
    cursor.execute("SELECT id, name, priority, bot_type FROM rules ORDER BY id")
    print("\nCurrent rules:")
    for r in cursor.fetchall():
        print(f"  [{r[0]}] {r[1]} (priority={r[2]}, bot_type={r[3]})")

    conn.commit()
    conn.close()
    print("\n✅ Migration complete!")
    print("Recommended priorities (lower = higher priority):")
    print("""
    UPDATE rules SET priority = 10 WHERE name = 'frustrated_complaint';
    UPDATE rules SET priority = 20 WHERE name = 'problem_issue';
    UPDATE rules SET priority = 30 WHERE name = 'price_inquiry';
    UPDATE rules SET priority = 40 WHERE name = 'contact_request';
    UPDATE rules SET priority = 50 WHERE name = 'interest_want';
    UPDATE rules SET priority = 60 WHERE name = 'recommendation';
    UPDATE rules SET priority = 70 WHERE name = 'availability';
    UPDATE rules SET priority = 80 WHERE name = 'location';
    UPDATE rules SET priority = 90 WHERE name = 'working_hours';
    UPDATE rules SET priority = 100 WHERE name = 'collaboration';
    UPDATE rules SET priority = 110 WHERE name = 'compliment_praise';
    UPDATE rules SET priority = 120 WHERE name = 'greeting';
    UPDATE rules SET priority = 130 WHERE name = 'emoji_only';
    UPDATE rules SET priority = 140 WHERE name = 'one_word_generic';
    UPDATE rules SET priority = 150 WHERE name = 'generic_comment';
    UPDATE rules SET priority = 900 WHERE name = 'catch_all';
    """)


if __name__ == "__main__":
    asyncio.run(migrate())
