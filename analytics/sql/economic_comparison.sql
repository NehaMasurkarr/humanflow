-- Exact-year comparison. No nearest-year joining, annualization, or currency conversion.
SELECT g.id, g.name, o.year, i.code, i.name AS indicator, o.unit, o.value, o.status
FROM humanflow.economic_current o
JOIN humanflow.economic_indicators i ON i.code = o.indicator
JOIN humanflow.countries g ON g.id = o.geography_id
WHERE o.year = %(year)s AND o.indicator = %(indicator)s
ORDER BY o.value DESC NULLS LAST, g.id;
