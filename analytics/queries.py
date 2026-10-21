"""Execute bounded, parameterized analytical queries with period validation."""

from importlib.resources import files

from psycopg.rows import dict_row

from pipelines.validation import MEASURES, ValidationError

QUERIES = {
    "top_corridors": {"dataset_id", "year_start", "year_end", "measure", "limit"},
    "geography_comparison": {"dataset_id", "year_start", "year_end", "measure"},
    "migration_trends": {"family", "measure", "origin_id", "destination_id"},
    "net_migration": {"dataset_id", "year_start", "year_end"},
    "economic_comparison": {"year", "indicator"},
}


def query(connection, name: str, params: dict) -> list[dict]:
    if name not in QUERIES or set(params) != QUERIES[name]:
        raise ValidationError("Unknown query or unexpected/missing parameters")
    if "limit" in params and (type(params["limit"]) is not int or not 1 <= params["limit"] <= 1000):
        raise ValidationError("Limit must be 1..1000")
    if "measure" in params and params["measure"] not in MEASURES:
        raise ValidationError("Unsupported measure")
    if "dataset_id" in params:
        row = connection.execute(
            "SELECT r.metadata FROM humanflow.dataset_releases r "
            "JOIN humanflow.active_batch a USING(batch_id) WHERE r.dataset_id=%s",
            (params["dataset_id"],),
        ).fetchone()
        if not row:
            raise ValidationError("Unknown active dataset")
        spec = row[0]
        for field in ["year_start", "year_end"]:
            if params[field] not in spec["years"]:
                raise ValidationError("Unsupported comparison year")
        expected = 1 if spec["period"] == "filing_year_transition" else 0
        if params["year_end"] - params["year_start"] != expected:
            raise ValidationError("Unsupported period comparison")
        allowed = {
            "un_stock": {"stock_persons"},
            "acs": {"acs_movers"},
            "irs": {"tax_returns", "tax_individuals"},
        }
        if "measure" in params and params["measure"] not in allowed.get(spec["kind"], set()):
            raise ValidationError("Unsupported measure for dataset")
        if name == "net_migration" and spec["kind"] != "acs":
            raise ValidationError("Net migration supported only for complete ACS state estimates")
    if name == "economic_comparison":
        releases = connection.execute(
            "SELECT r.metadata FROM humanflow.dataset_releases r "
            "JOIN humanflow.active_batch a USING(batch_id) "
            "WHERE r.metadata->>'indicator'=%s",
            (params["indicator"],),
        ).fetchall()
        if not releases or not any(params["year"] in r[0]["years"] for r in releases):
            raise ValidationError("Unsupported economic indicator/year")
    if name == "migration_trends":
        releases = connection.execute(
            "SELECT r.metadata FROM humanflow.dataset_releases r "
            "JOIN humanflow.active_batch a USING(batch_id) "
            "WHERE r.metadata->>'family'=%s",
            (params["family"],),
        ).fetchall()
        allowed = {
            "un_stock": {"stock_persons"},
            "acs": {"acs_movers"},
            "irs": {"tax_returns", "tax_individuals"},
        }
        if not releases or not all(
            params["measure"] in allowed.get(r[0]["kind"], set()) for r in releases
        ):
            raise ValidationError("Unsupported trend family/measure")
    statement = files("analytics").joinpath("sql", name + ".sql").read_text()
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(statement, params)
        return cursor.fetchall()
