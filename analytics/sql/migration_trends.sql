-- No interpolation; stock differences are explicitly labelled stock changes, never net flows.
WITH selected AS (
    SELECT dataset_id, year_start, year_end, observation_type, period, unit, value, status,
           lag(value) OVER (ORDER BY year_end) AS previous_value,
           lag(year_end) OVER (ORDER BY year_end) AS previous_year
    FROM humanflow.migration_current
    WHERE family = %(family)s AND measure = %(measure)s
      AND origin_id = %(origin_id)s AND destination_id = %(destination_id)s
)
SELECT *, value - previous_value AS change_between_observations,
       CASE WHEN observation_type = 'stock' THEN 'change_in_stock'
            ELSE 'change_in_flow_estimate' END AS change_definition
FROM selected ORDER BY year_end;
