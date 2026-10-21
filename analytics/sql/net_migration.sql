-- Net interstate ACS estimates, restricted to the 50 states + DC universe.
-- Require every incoming and outgoing cell for each geography to be published and observed.
-- No net values are returned for stocks or IRS incomplete disclosed-corridor data.
WITH selected AS (
    SELECT * FROM humanflow.migration_current
    WHERE dataset_id = %(dataset_id)s AND year_start = %(year_start)s
      AND year_end = %(year_end)s AND measure = 'acs_movers'
      AND observation_type = 'flow' AND period = 'one_year_estimate'
      AND geography_level = 'state' AND family = 'acs_1year_state'
), sides AS (
    SELECT destination_id AS geography_id, value AS incoming, 0::numeric AS outgoing, status
    FROM selected
    UNION ALL
    SELECT origin_id, 0::numeric, value, status FROM selected
)
SELECT g.id, g.name, sum(s.incoming) AS inflow, sum(s.outgoing) AS outflow,
       sum(s.incoming) - sum(s.outgoing) AS net_interstate_estimate,
       '50 states + DC; population age 1+; ACS 1-year estimate' AS universe
FROM sides s JOIN humanflow.us_states g ON g.id = s.geography_id
GROUP BY g.id, g.name
HAVING count(*) = 100 AND bool_and(s.status = 'observed')
ORDER BY net_interstate_estimate DESC, g.id;
