-- These are sums over published corridors, not full population totals.
-- UN output represents stocks by origin/destination; IRS output omits suppressed corridors.
WITH selected AS (
    SELECT * FROM humanflow.migration_current
    WHERE dataset_id = %(dataset_id)s AND year_start = %(year_start)s
      AND year_end = %(year_end)s AND measure = %(measure)s
), sides AS (
    SELECT destination_id AS geography_id, 'destination' AS side, value, status FROM selected
    UNION ALL
    SELECT origin_id, 'origin', value, status FROM selected
)
SELECT g.id, g.name, s.side, sum(s.value) AS sum_of_reported_values,
       count(*) AS published_corridors, count(*) FILTER (WHERE s.status <> 'observed') AS unavailable,
       %(measure)s AS measure
FROM sides s JOIN humanflow.geographies g ON g.id = s.geography_id
GROUP BY g.id, g.name, s.side ORDER BY g.id, s.side;
