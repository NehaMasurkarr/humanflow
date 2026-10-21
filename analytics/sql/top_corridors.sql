-- One source, one exact period, one measure. Never sum stocks across time.
SELECT m.dataset_id, m.observation_type, m.scope, m.period,
       m.year_start, m.year_end, o.name AS origin, d.name AS destination,
       m.measure, m.unit, m.value, m.moe
FROM humanflow.migration_current m
JOIN humanflow.geographies o ON o.id = m.origin_id
JOIN humanflow.geographies d ON d.id = m.destination_id
WHERE m.dataset_id = %(dataset_id)s AND m.year_start = %(year_start)s
  AND m.year_end = %(year_end)s AND m.measure = %(measure)s AND m.status = 'observed'
ORDER BY m.value DESC, m.origin_id, m.destination_id
LIMIT %(limit)s;
