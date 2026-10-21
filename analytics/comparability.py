"""Reject comparisons across incompatible populations, periods, and source methods."""

from pipelines.validation import ValidationError


def assert_comparable(left: dict, right: dict, *, net: bool = False) -> None:
    """Compare normalized rows enriched with dataset metadata; never interpolate years."""
    for field in [
        "family",
        "observation_type",
        "scope",
        "period",
        "geography_level",
        "measure",
        "unit",
    ]:
        if left[field] != right[field]:
            raise ValidationError(f"Unsupported comparison: different {field}")
    for row in [left, right]:
        if row["year_start"] not in row["years"] or row["year_end"] not in row["years"]:
            raise ValidationError("Unsupported comparison year")
    if left["year_end"] - left["year_start"] != right["year_end"] - right["year_start"]:
        raise ValidationError("Unsupported comparison: different interval lengths")
    if net and (
        left["observation_type"] != "flow"
        or (left["year_start"], left["year_end"]) != (right["year_start"], right["year_end"])
    ):
        raise ValidationError("Net migration requires same-period flows; stocks are unsupported")
