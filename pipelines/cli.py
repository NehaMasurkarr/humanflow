"""HumanFlow data commands. Run from the repository root or supply --root."""

import argparse
import json
import os
from pathlib import Path

import psycopg

from analytics.queries import QUERIES, query
from pipelines.build import build, read_bundle
from pipelines.database import load_bundle, migrate
from pipelines.sources import fetch


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    commands = parser.add_subparsers(dest="command", required=True)
    get = commands.add_parser("fetch", help="Download pinned official sources; never substitute")
    get.add_argument("--refresh", action="store_true", help="Explicitly update source checksums")
    commands.add_parser("build", help="Validate and write an immutable processed bundle")
    load = commands.add_parser("load", help="Migrate PostgreSQL and atomically publish a bundle")
    load.add_argument("bundle", type=Path)
    report = commands.add_parser("report", help="Verify a bundle and print its validation report")
    report.add_argument("bundle", type=Path)
    sql = commands.add_parser("query", help="Run a parameterized analytics query")
    sql.add_argument("name", choices=QUERIES)
    sql.add_argument("--params", type=json.loads, required=True)
    args = parser.parse_args()
    if args.command == "fetch":
        result = fetch(args.root, refresh=args.refresh)
        print(f"Verified {len(result['sources'])} source snapshots")
    elif args.command == "build":
        print(build(args.root))
    elif args.command == "report":
        manifest, _ = read_bundle(args.bundle)
        print(json.dumps({"counts": manifest["counts"], "reports": manifest["reports"]}, indent=2))
    else:
        url = os.environ.get("DATABASE_URL")
        if not url:
            parser.error("DATABASE_URL must be set; see .env.example")
        with psycopg.connect(url) as connection:
            if args.command == "load":
                migrate(connection)
                result = load_bundle(connection, args.bundle)
            else:
                result = query(connection, args.name, args.params)
        print(json.dumps(result, indent=2, default=str))
